import React, { useEffect, useRef, useState } from 'react';
import { Box, Button, Collapsible, List, Text } from 'grommet';
import { useConnectProgramNode, useCreateProgramFlow, useCreateProgramNode, useDeleteProgramNodes, useDisconnectProgramNode, useUpdateProgramNode } from '@hive-command/api';

import { IconNodeFactory, InfiniteCanvasNode, InfiniteCanvas, ZoomControls, InfiniteCanvasPath, HyperTree } from '@hexhive/ui';
import { HMINodeFactory } from '../../../../components/hmi-node/HMINodeFactory';
import { nanoid } from 'nanoid';
import { NodeDropdown } from '../../../../components/node-dropdown';
import { Connect, Action, Trigger, PowerShutdown, Add, Clock, Cycle } from 'grommet-icons';
import { gql, useApolloClient, useQuery } from '@apollo/client';
import { ProgramCanvas } from '../../../../components/program-canvas';

import Settings from './Settings';
import { ProgramEditorProvider } from './context';
import { ProgramDrawer } from './Drawer';
import { useEditor } from './store';
import { debounce, pick } from 'lodash';
import { useParams } from 'react-router-dom';
import { useCommandEditor } from '../../context';
import { ProgramCanvasModal } from '../../../../components/modals/program-canvas';
import { ObjectTypeDefinitionNode } from 'graphql';
import { cleanTree } from '../../utils';
import { EmptyView } from '../../components/empty-view';

const reducer = (state, action) => {
    switch (action.type) {
        case 'ADD_NODE':
            let newNode = action.data;
            console.log("ADD")

            return { ...state, nodes: [...state.nodes, newNode] }
            break;
        default:
            return state;
    }
}

export const Program = (props) => {

    const { id } = useParams()

    const { sidebarOpen, program } = useCommandEditor()

    const [ selectedItem, setSelectedItem ] = useState<{id?: string} | undefined>(undefined)
    const [ activeProgram, setActiveProgram ] = useState<string>(undefined)


    const createProgramFlow = useCreateProgramFlow(id)

    const [state, dispatch] = useEditor(reducer, {
        nodes: [],
        paths: []
    })

    const [conditions, setConditions] = useState<any[]>([])
    const [modalOpen, openModal] = useState<boolean>(false);

    const [selected, _setSelected] = useState<{ key?: "node" | "path", id?: string }>({})
    const selectedRef = useRef<{ selected?: { key?: "node" | "path", id?: string } }>({})
    const setSelected = (s: { key?: "node" | "path", id?: string }) => {
        _setSelected(s)
        selectedRef.current.selected = s;
    }

    const [nodes, setNodes] = useState<InfiniteCanvasNode[]>([])
    const [paths, setPaths] = useState<InfiniteCanvasPath[]>([])

    const client = useApolloClient()

    const nodeMenu = [
        {
            icon: <Action />,
            label: "Action",
            extras: {
                label: "Action",
                icon: 'Action'
            },
        },
        {
            icon: <Trigger />,
            label: "Trigger",
            extras: {
                label: "Trigger",
                icon: 'Trigger'
            }
        },
        {
            icon: <PowerShutdown />,
            label: "Shutdown",
            extras: {
                label: "Shutdown",
                icon: "PowerShutdown"
            }
        },
        // {
        //     icon: <Cycle />,
        //     label: "PID",
        //     extras: {
        //         label: "PID",
        //         icon: "Cycle"
        //     }
        // },
        {
            icon: <Clock />,
            label: "Timer",
            extras: {
                label: "Timer",
                icon: "Clock"
            }
        },
   
    ]

    const { data } = useQuery(gql`
    query Q ($id: ID, $program: ID!){
        commandPrograms(where: {id: $id}){
            id
            name


            devices {
                id
                name
                requiresMutex
                type {
                    id
                    name
                    state {
                        id
                        key
                        type
                    }
                    actions {
                        id
                        key
                    }
                }
            }

        }

        commandProgramFlows (where: {id: $program}) {
                id
                name

                children {
                    id
                    name
                }

                parent {
                    id
                }

                conditions {
                    id
                    inputDevice {
                        id
                        name
                    }
                    inputDeviceKey {
                        id
                        key
                    }
                    comparator
                    assertion
                }
                nodes {
                    id
                    type
                    x 
                    y


                    subprocess {
                        id
                        name
                    }

                    actions {
                        id
                        release

                        device {
                            id
                            name
                        }
                        request {
                            id
                            key
                        }
                    }
                    configuration {
                        id
                        key
                        
                        value
                    }

                    nextConnection {
                        edges {
                            conditions

                            id
                            sourceHandle
                            targetHandle


                            points {
                                x
                                y
                            }
                            node {
                                id
                            }
                        }
                    }
                }
            
        }
    }
`, {
        variables: {
            id: id,
            program: activeProgram
        }
    })

    const refetch = () => {
        client.refetchQueries({ include: ['Q'] })
    }

    let flow = data?.commandProgramFlows?.[0]


    const createProgramNode = useCreateProgramNode(id, activeProgram, flow?.parent?.id)
    const updateProgramNode = useUpdateProgramNode(id, activeProgram, flow?.parent?.id)
    const deleteProgramNodes = useDeleteProgramNodes(id, activeProgram, flow?.parent?.id)
    const connectProgramNode = useConnectProgramNode(id, activeProgram, flow?.parent?.id)
    const disconnectProgramNode = useDisconnectProgramNode(id, activeProgram, flow?.parent?.id)

    useEffect(() => {
        if (flow && activeProgram) {
            setNodes(flow.nodes.map((x) => ({
                id: x.id,
                x: x.x,
                y: x.y,
                extras: {
                    icon: x.type,
                    label: x.subprocess?.name,
                    configuration: [
                        ...x.configuration,
                        { key: "actions", value: x.actions }
                    ]
                    // actions: x.actions
                },
                type: 'icon-node'

            })))

            
            setPaths(flow.nodes.map((x) => {
                console.log("NEXT", x)
                return x.nextConnection.edges.map((conn) => ({
                    id: conn.id,
                    source: x.id,
                    sourceHandle: conn.sourceHandle,
                    target: conn.node.id,
                    targetHandle: conn.targetHandle,
                    points: conn.points,
                    extras: {
                        configuration: {
                            conditions: conn.conditions
                        }
                    }
                }))
            }).reduce((prev, curr) => prev.concat(curr), []))
        }
    }, [flow, activeProgram])


    // const [addNode, addInfo] = useMutation((mutation, args: { type: string, x: number, y: number, subprocess?: string}) => {
    //     let createNode : any = {
       
    //             type: args.type,
    //             x: args.x,
    //             y: args.y,
            
    //     }

    //     if(args.type == "Connect" && args.subprocess){
    //         console.log("CoNFIG")
    //         createNode.subprocess = {
    //             connect: {where: {node: {id: args.subprocess}}}
    //         }
    //     }
    //     const program = mutation.updateCommandProgramFlows({
    //         where: { id: activeProgram },
    //         update: {
    //                 nodes: [{
    //                     create: [{
    //                        node: createNode
    //                     }]
    //                 }]
    //         }

    //     })
    //     return {
    //         item: {
    //             ...program.commandProgramFlows[0]
    //         }
    //     }
    // })


    // const [updateNode, updateInfo] = useMutation((mutation, args: {
    //     id: string,
    //     x?: number,
    //     y?: number
    // }) => {

    //     let update: any = {};

    //     if (args.x) update.x = args.x;
    //     if (args.y) update.y = args.y;

    //     const updated = mutation.updateCommandProgramNodes({
    //         where: { id: args.id },
    //         update: {
    //             x: args.x,
    //             y: args.y
    //         }
    //     })
    //     return {
    //         item: {
    //             ...updated.commandProgramNodes[0]
    //         }
    //     }
    // });


    const deleteSelected = async (selected: { type: "node" | "path", id: string }[]) => {

        let queries = [];

        let query: any = {};
        let nodes = selected.filter((a) => a.type == "node").map((x) => x.id)
        let _paths = selected.filter((a) => a.type == "path").map((x) => x.id)

        let disconnectInfo: any = {};
        let deleteInfo: any = {};
        if (_paths.length > 0) {
            let path = paths.find((a) => a.id == _paths[0]);

            queries.push(
                disconnectProgramNode(path.source, path.sourceHandle, path.target, path.targetHandle)
            )
    
            // return {
            //     item: {
            //         ...disconnectInfo.commandProgramNodes?.[0]
            //     }
            // }
        }
        if (nodes.length > 0) {
            query = {
                id_IN: nodes,
            }

            queries.push(
                deleteProgramNodes(nodes)
            )

        }
        return await Promise.all(queries)
    }

    // const [connectNodes, connectInfo] = useMutation((mutation, args: {
    //     source: string,
    //     sourceHandle: string,
    //     target: string,
    //     targetHandle: string,
    //     points?: { x: number, y: number }[]
    // }) => {
    //     const updated = mutation.updateCommandProgramNodes({
    //         where: { id: args.source },
    //         update: {
    //             next: [{
    //                 connect: [{
    //                     where: {
    //                         node: {
    //                             id: args.target
    //                         }
    //                     }, edge: {
    //                         sourceHandle: args.sourceHandle,
    //                         targetHandle: args.targetHandle,
    //                         points: args.points.map((x) => pick(x, ['x', 'y']))
    //                     }
    //                 }]
    //             }]
    //         }
    //     })
    //     return {
    //         item: {
    //             ...updated.commandProgramNodes[0]
    //         }
    //     }
    // })

    const renderSelectedSettings = () => {
        if (!selected || selected.key != 'node') return;

        let node = nodes.find((a) => a.id == selected.id)

        switch (node?.extras?.icon) {
            case 'Cycle':
                return (
                    <Box flex>
                        <Box
                            align="center"
                            direction="row">
                            <Text>PID</Text>

                            <Button
                                size="small"
                                icon={<Add size="small" />} />
                        </Box>

                    </Box>
                )
            case 'Action':
                return (
                    <Box flex>
                        <Box
                            align="center"
                            justify="between"
                            direction="row">
                            <Text>Actions</Text>
                            <Button
                                onClick={() => openModal(true)}
                                hoverIndicator
                                icon={<Add size="small" />} />
                        </Box>
                        <Box>
                            <List

                                data={node.extras.actions || []}>
                                {(datum) => (
                                    <Text size="small">{datum.device.name} - {datum.request.key}</Text>
                                )}
                            </List>
                        </Box>
                    </Box>
                )
            case 'Trigger':
                return (<Text>Triggers</Text>)
        }

    }



    const watchEditorKeys = () => {
        if (selectedRef.current.selected.id) {
            deleteSelected([selectedRef.current.selected].map((x) => ({
                        type: x.key,
                        id: x.id
                    }))
            ).then(() => {
                refetch()
            })
        }

    }


    const devices = data?.commandPrograms?.[0].devices || []

    useEffect(() => {
        setConditions(flow?.conditions)
    }, [flow])

    console.log("Conditions", conditions)

    return (
        <ProgramEditorProvider
            value={{
                flow,
                refresh: refetch,
                devices,
                conditions: conditions,
                program,
                activeProgram: activeProgram,
                selectedType: selected.key,
                selected: selected.key == 'node' ? nodes.find((a) => a.id == selected.id) : paths.find((a) => a.id == selected.id)
            }}
        >
            <Box flex direction='row'>
                <Collapsible    
                    direction="horizontal"
                    open={sidebarOpen}>
                    <Box 
                        elevation='small'
                        flex
                        width="small">
                        {/* <Box 
                            pad="xsmall"
                            border={{side: 'bottom', size: 'small'}}
                            direction="row" 
                            align="center" 
                            justify="between">
                            <Text size="small">{view}</Text>
                            <Button
                                onClick={() => {
                                    if(view == "Program"){
                                        addProgram().then(() => {
                                            refetch()
                                        })
                                    }else{
                                        addHMI().then(() => {
                                            refetch()
                                        })
                                    }
                                 
                                }}
                                hoverIndicator
                                plain
                                style={{padding: 6, borderRadius: 3}}
                                icon={<Add size="small" />} />
                        </Box> */}

                <ProgramCanvasModal
                    open={modalOpen}
                    onSubmit={(item) => {
                            let parent = selectedItem.id !== 'root' ? selectedItem.id : undefined;
                            createProgramFlow(item.name, parent).then(() => {
                                refetch()
                            })
          
                        
                        openModal(false)
                    }}
                    onClose={() => {
                        setSelectedItem(undefined)
                        openModal(false)
                    }}
                    modal={(gql`
                        type Project {
                            name: String
                        }
                    `).definitions.find((a) => (a as ObjectTypeDefinitionNode).name.value == "Project") as ObjectTypeDefinitionNode} />
                        <HyperTree 
                            id="editor-menu"
                            onCreate={(node) => {
                                console.log("CREATE", node)
                                setSelectedItem(node.data)
                                openModal(true)
                            }}
                            onSelect={(node) => {
                                if(node.data.id !== 'root'){
                                    setActiveProgram(node.data.id)
                                }
                            }}
                            data={[{
                                id: 'root',
                                name: `Program`,
                                children: cleanTree(program?.program) || []
                            }]} />
                        {/* <List 
                            onClickItem={({item}) => {
                                console.log(item)
                                setActiveProgram(item.id)
                            }}
                            primaryKey="name"
                            data={view == "Program" ? program.program : program.hmi} /> */}
                    </Box>
                </Collapsible>
                
                {activeProgram != undefined ? (
                <ProgramCanvas
                    onDelete={watchEditorKeys}
                    menu={[
                        {
                            key: 'nodes',
                            icon: <Action />,
                            panel: (
                                <NodeDropdown
                                    items={nodeMenu.concat((flow?.children || []).map((x) => ({
                                        icon: <Connect />,
                                        label: x.name,
                                        
                                        extras: {
                                            label: x.name,
                                            icon: "Connect",
                                            subprocess: x.id
                                        }
                                    })))}
                                />
                            )
                        },
                        {
                            key: 'settings',
                            icon: <Settings width="24px" />,
                            panel: (
                                <ProgramDrawer />
                            )
                        }
                    ]}
                    selected={[selected]}
                    onSelect={(selected) => {
                        setSelected(selected)
                    }}

                    onNodeCreate={(position, node) => {
                        console.log("Node create", node)
                        // dispatch({type: "ADD_NODE", data: {
                        //     x: position.x,
                        //     y: position.y,
                        //     type: node.extras.icon
                        // }})

                        createProgramNode(
                            node.extras.icon, 
                            position.x, 
                            position.y, 
                            node.extras.subprocess
                        ).then(() => {
                            refetch()
                        })
                    }}
                    onNodeUpdate={(node) => {
                        updateProgramNode(
                            node.id,
                            node.x,
                            node.y
                        ).then(() => {
                            refetch()
                        })
                    }}

                    onPathCreate={(path) => {

                        connectProgramNode(
                            path.source,
                            path.sourceHandle,
                            path.target,
                            path.targetHandle,
                            path.points
                        ).then(() => {
                            refetch()
                        })
                    }}

                    nodes={nodes}
                    paths={paths}
                />) : (
                    <EmptyView label={"program"} />
                )}
            </Box>
        </ProgramEditorProvider>

    )
}