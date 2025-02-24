import React, { useEffect, useState } from 'react';
import { DeviceModal } from '../../components/modals/device';
import { useCreateDevice, useUpdateDevice } from '@hive-command/api'
import { DeploymentList, DeploymentInfo } from '../../components/deployment-list';
import { Box, TextInput, Button } from 'grommet';
import * as Icons from 'grommet-icons';
import { isEqual } from 'lodash';
import { nanoid } from 'nanoid';

import { useQuery as useApollo, gql } from '@apollo/client'
import { useAuth } from '@hexhive/auth-ui';
export interface DevicePageProps {
    match?: any;
    history?: any;
}

export const Devices : React.FC<DevicePageProps> = (props) => {
    const [ modalOpen, openModal ] = useState<boolean>(false);

    const [ selectedDevice, setSelectedDevice ] = useState<any>();
    const [ editDevice, setEditDevice ] = useState<any>();

    const { activeUser } = useAuth()

    // const [ _devices, setDevices ] = useState<CommandDevice[]>([])

    // const query = useQuery({
    //     staleWhileRevalidate: true,
    //     suspense: false
    // })

    const { data } = useApollo(gql`
        query Q {
            commandDevices { 
                id
                name

                online
                lastOnline

                network_name

                activeProgram{ 
                    id
                    name
                }
            }

            commandPrograms {
                id
                name
            }
        }
    ` )

    const devices = data?.commandDevices || [];
    const programs = data?.commandPrograms || []

    const createDevice = useCreateDevice(activeUser?.id)
    const updateDevice = useUpdateDevice(activeUser?.id)

    // useEffect(() => {
    //     if(devices){
    //         setDevices(devices)
    //     }
    // }, [devices])



//     const [ createDevice, {isLoading}] = useMutation((mutation, args: {
//         name: string, 
//         network_name: string, 
//         program?: string
//     }) => {
//         let program = {};
//         if(args.program){
//             program = {
//                 activeProgram: {connect: {where: {node: {id: args.program}}}}
//             }
//         }
//         const result = mutation.createCommandDevices({input: [{
//             name: args.name,
//             network_name: args.network_name,
//             ...program,
            
//         }]})

//         return {
//             item: {
//                 ...result?.commandDevices[0]
//             },
//             error: null
//         }
//     }, {
//         onCompleted(data) {},
//         onError(error) {},
//         refetchQueries: [],
//         awaitRefetchQueries: true,
//         suspense: false, 
// })
//     const [ updateDevice, info ] =  useMutation((mutation, args: { 
//         id: string, 
//         name: string, 
//         network_name: string, 
//         program?: string
//     }) => {
//         let programUpdate = {};
//         if(args.program){
//             programUpdate = {
//                 activeProgram: {connect: {where: {node: {id: args.program}}}}
//             }
//         }
//         const result = mutation.updateCommandDevices({
//             where: {id: args.id},
//             update: {
//                 name: args.name,
//                 network_name: args.network_name,
//                 ...programUpdate
//             }
//             // program: args.program
//         })

//         return {
//             item: {
//                 ...result?.commandDevices[0]
//             },
//             error: null
//         }
//     })



    const onSubmit = (device: any) => {
        console.log("Submit", device)
        if(device.id){
            updateDevice(device.id, device.name, device.network_name || nanoid().substring(0, 8), device.activeProgram?.id).then((updated) => {
                console.log("Update result", updated)
            })
        }else{
            createDevice(device.name || '', device.network_name || nanoid().substring(0, 8), device.activeProgram?.id).then((new_device) => {
                // if(new_device.item){
                //     let d: any[] = devices.slice()
                //     d.push(new_device.item)
                //     // setDevices(d)
                //     return true;
                // }
            })
        }
    }

    const goToSingle = (id: string) => {
        props.history.push(`${props.match.url}/${id}`)
    }

    return (
        <Box
        round="xsmall"
        overflow="hidden"
            elevation="small"
            background="neutral-1"
            flex
            direction="column" 
            className="device-list">
            <DeviceModal 
                selected={editDevice}
                programs={programs}
                open={modalOpen}
                onSubmit={onSubmit}
                onClose={() => {
                    setEditDevice(null)
                    openModal(false)
                }} />
            <Box background="accent-1" align="center" direction="row" pad="small">
                <Box flex background="#ffffff42" round="xsmall">
                <TextInput plain placeholder="Search Devices..." />
                </Box>
                <Button
                    onClick={() => openModal(true)}
                     margin={{left: 'small'}} 
                     primary 
                     hoverIndicator 
                     label="Add"
                     icon={<Icons.Add />} />
            </Box>
            <Box
                flex
                direction="row"
                >
            <DeploymentList
                devices={devices}
                programs={programs}
                selected={[selectedDevice?.id]}
                onClickRow={({datum}) => {
                    console.log(datum)
                   
                    if(isEqual(selectedDevice, datum)){
                        setSelectedDevice(undefined)
                    }else{
                        setSelectedDevice(datum)
                    }
                }}
                onEditRow={(datum) => {
                    setEditDevice(datum)
                    openModal(true)
                    console.log("Edit", datum)
                }}
                 />
            <DeploymentInfo 
                deployment={selectedDevice}
                open={Boolean(selectedDevice)}/>
                
            </Box>
            
        </Box>
    )
}