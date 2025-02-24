import { nanoid } from 'nanoid';
import { Session } from 'neo4j-driver';
import { Channel } from 'amqplib';
import { Pool } from 'pg';
import { getDeviceActions } from '../data';
import { DeviceValue } from '@hexhive/types'

import { OGM } from '@neo4j/graphql-ogm'

const getProjection = (fieldASTs: any) => {
	const { selections } = fieldASTs.selectionSet;
	return selections.reduce((projs: any, selection: any) => {
	  switch (selection.kind) {
		case 'Field':
		  return {
			...projs,
			[selection.name.value]: 1
		  };
		case 'InlineFragment':
		  return {
			...projs,
			...getProjection(selection),
		  };
		default:
		  throw 'Unsupported query';
	  }
	}, {});
  }

export default async (session: Session, pool: Pool, channel: Channel) => {


	return {
		Query : {
			commandDeviceTimeseriesTotal: async (root: any, args: {
				deviceId: string, //device in quest
				device: string, //deviceId in quest
				valueKey?: string,
				startDate?: string,
			}) => {
				const client = await pool.connect()

				const { deviceId, device, valueKey, startDate } = args

				console.log({deviceId}, {device}, {valueKey})
				const query = `
				SELECT 
					sum(SUB.total) as total
				FROM 
					(
						SELECT (try_cast(value, 0) / 60) * EXTRACT(EPOCH from (LEAD(timestamp) over (order by timestamp) - timestamp)) as total
						FROM
							command_device_values
						WHERE
							device = $1
							AND deviceId = $2
							AND valueKey = $3
							AND timestamp >= NOW() - (7 * INTERVAL '1 day') 
						GROUP by deviceId, device, valueKey, timestamp, value
					) as SUB
				`//startDate
				const result = await client.query(query, [deviceId, device, valueKey ])
				await client.release()
				console.log(result)
				return result.rows?.[0]
			},
			commandDeviceTimeseries: async (root: any, args: {
				deviceId: string, //device in quest
				device: string, //deviceId in quest
				valueKey?: string,
				startDate?: string,
			}) => {
				const client = await pool.connect()

				let query = `SELECT * FROM command_device_values WHERE deviceId=$1 AND device=$2`;
				let params = [args.device, args.deviceId]

				if(args.startDate){
					params.push(new Date(args.startDate).toISOString())
					query += ` AND timestamp >= $${params.length}`
				}
				if(args.valueKey) {
					params.push(args.valueKey)

					query += ` AND valueKey=$${params.length}`
				}

				console.log(query, params)

				const result = await client.query(
					query,
					params
				)

				console.log(result)

				await client.release()
				return result.rows;
			},
			commandDeviceValue: async (root: any, args: {
				bus: string,
				device: string,
				port: string
			}) => {

				const values = await DeviceValue.find({device: args.device});

				// const client = await pgClient.connect()

				// let where = ``;
				// let whereClause : string[] = []
				// let whereArgs : {key: string, value: string}[] = []

				// if(args.bus) {
				// 	// whereClause.push(`bus=$1`)
				// 	whereArgs.push({value: args.bus, key: 'bus'})
				// }

				// if(args.device){
				// 	whereArgs.push({value: args.device, key: 'device'})
				// 	// whereClause.push(`device=$2`)
				// }

				// if(args.port){
				// 	whereArgs.push({value: args.port, key: 'bus'})
				// }

				// if(whereClause.length > 0){
				// 	where += `WHERE ${whereArgs.map((x, ix) => `${x.key}=$${ix + 1}`).join(' AND ')}`
				// }


				// const values = await client.query(
				// 	`SELECT * FROM commandDeviceValues ${where} LATEST BY device,deviceId,valueKey`,
				// 	[whereArgs.map((x) => x.value)]
				// )

				// await client.release()
				
				return values;
			}
		},
		Mutation: {
			requestFlow: async (root: any, args: any, context: any) => {
				console.log(args)
				const waitingId = nanoid()
				const device = await session.writeTransaction(async (tx) => {

					const res = await tx.run(`
						MATCH (device:CommandDevice {id: $id})
						OPTIONAL MATCH (action:CommandProgramAction {id: $actionId})-->(flow:CommandProgramFlow)
						RETURN device{.*, action: flow{.*}}
					`, {
						id: args.deviceId,
						actionId: args.actionId
					})

					await tx.run(`
						MATCH (device:CommandDevice {id: $id})
						MERGE (device)-[:WAITING_FOR {id: $waitingId, start: datetime($date)}]->(action:CommandProgramAction {id: $actionId})
					`, {
						id: args.deviceId,
						actionId: args.actionId,
						waitingId: waitingId,
						date: new Date().toISOString()
					})
					return res.records?.[0]?.get(0)
					// return await getDeviceActions(tx, args.deviceId, args.deviceName)
				
				})

				let action = device.action

				console.log(device, action)
				if(action){
					let actionRequest = {
						waitingId: waitingId,
						address: `opc.tcp://${device.network_name}.hexhive.io:8440`,
						deviceId: args.deviceId,
						flow: action.id
					}
					return await channel.sendToQueue(`COMMAND:FLOW:PRIORITIZE`, Buffer.from(JSON.stringify(actionRequest)))
				}
				// 	return await channel.sendToQueue(`COMMAND:DEVICE:CONTROL`, Buffer.from(JSON.stringify(actionRequest)))
				// }

				// console.log("DEVICE ACTION", device, args.action, action)

				// let stateChange = {
				// 	device: `opc.tcp://${device.network_name}.hexhive.io:8440`, //opc.tcp://${network_name}.hexhive.io:8440
				// 	busPath: `/Objects/1:Devices/1:${device.type.toUpperCase()}|${device.id}|${args.port}/1:value`, ///1:Objects/1:Devices/${TYPE|SERIAL|PORT}/${key}
				// 	value: args.value == '0' ? false : true //false
				// }

				// console.log("Sending state change", stateChange)
			
				// return await channel.sendToQueue(`COMMAND:DEVICE:CONTROL`, Buffer.from(JSON.stringify(stateChange)))
			},
			performDeviceAction: async (root: any, args: any, context: any) => {
				console.log(args)
				const device = await session.readTransaction(async (tx) => {

					return await getDeviceActions(tx, args.deviceId, args.deviceName)
					
					// const result = await tx.run(`
					// 	MATCH (hostDevice:CommandDevice)-->(peripheral:CommandDevicePeripheral)-[reality:PROVIDES_REALITY]->(device:CommandDevicePlaceholder {name: $name})
					// 	MATCH (map:CommandDevicePeripheralMap)-[:USES_DEVICE]->(device)
					// 	MATCH (map)-[:USES_STATE]->(state:CommandProgramDeviceState {key: $key})
					// 	MATCH (map)-[:USES_VARIABLE]->(variable)
					// 	RETURN device {
					// 		network_name: hostDevice.network_name,
					// 		type: peripheral.type,
					// 		id: peripheral.id,
					// 		valueKey: 
					// 	}
					// 	(device:CommandDevice {id: $id})-[:HAS_PERIPHERAL]->(bus:CommandDevicePeripheral {id: $peripheral})
					// 	RETURN device{
					// 		network_name: device.network_name,
					// 		type: bus.type,
					// 		id: bus.id
					// 	}
					// `, {
					// 	name: args.device,
					// 	key: args.key
					// })
					// return result?.records?.[0]?.get(0)
				})

				let action = device.actions?.find((a: any) => a.key == args.action)

				if(action){
					let actionRequest = {
						address: `opc.tcp://${device.network_name}.hexhive.io:8440`,
						deviceId: args.deviceId,
						deviceName: args.deviceName,
						action: action.key
					}

					// channel.
					return await channel.sendToQueue(`COMMAND:DEVICE:CONTROL`, Buffer.from(JSON.stringify(actionRequest)))
				}
				// console.log("DEVICE ACTION", device, args.action, action)

				// let stateChange = {
				// 	device: `opc.tcp://${device.network_name}.hexhive.io:8440`, //opc.tcp://${network_name}.hexhive.io:8440
				// 	busPath: `/Objects/1:Devices/1:${device.type.toUpperCase()}|${device.id}|${args.port}/1:value`, ///1:Objects/1:Devices/${TYPE|SERIAL|PORT}/${key}
				// 	value: args.value == '0' ? false : true //false
				// }

				// console.log("Sending state change", stateChange)
			
				// return await channel.sendToQueue(`COMMAND:DEVICE:CONTROL`, Buffer.from(JSON.stringify(stateChange)))
			},
			changeMode: async (root: any, args: {
				deviceId: string,
				mode: string
			}, context: any) => {

				const device = await session.readTransaction(async (tx) => {

					const res = await tx.run(`
						MATCH (device:CommandDevice {id: $id})
						RETURN device{.*}
					`, {
						id: args.deviceId
					})
					return res.records?.[0]?.get(0)
					// return await getDeviceActions(tx, args.deviceId, args.deviceName)
				
				})

				let actionRequest = {
					address: `opc.tcp://${device.network_name}.hexhive.io:8440`,
					deviceId: args.deviceId,
					mode: args.mode
				}

				await session.writeTransaction(async (tx) => {
					await tx.run(`
						MATCH (device:CommandDevice {id: $id})
						SET device.operatingMode = $mode
						RETURN device
					`, {
						id: args.deviceId,
						mode: args.mode
					})
				})

				return await channel.sendToQueue(`COMMAND:MODE`, Buffer.from(JSON.stringify(actionRequest)))
			},
			changeState: async (root: any, args: {deviceId: string, state: string}) => {
				if(args.state != "on" && args.state != "off" && args.state != "standby"){
					throw new Error("Invalid state")
				} 

				const device = await session.readTransaction(async (tx) => {

					const res = await tx.run(`
						MATCH (device:CommandDevice {id: $id})
						RETURN device{.*}
					`, {
						id: args.deviceId
					})
					return res.records?.[0]?.get(0)
				})

				let actionRequest = {
					address: `opc.tcp://${device.network_name}.hexhive.io:8440`,
					deviceId: args.deviceId,
					state: args.state
				}

				await session.writeTransaction(async (tx) => {
					await tx.run(`
						MATCH (device:CommandDevice {id: $id})
						SET device.operatingState = $state
						RETURN device
					`, {
						id: args.deviceId,
						state: args.state
					})
				})

				return await channel.sendToQueue(`COMMAND:STATE`, Buffer.from(JSON.stringify(actionRequest)))

			},
			changeDeviceMode: async (root: any, args: {
				deviceId: string,
				deviceName: string,
				mode: string
			}, context: any) => {
				const device = await session.readTransaction(async (tx) => {

					return await getDeviceActions(tx, args.deviceId, args.deviceName)
				
				})

				let actionRequest = {
					address: `opc.tcp://${device.network_name}.hexhive.io:8440`,
					deviceId: args.deviceId,
					deviceName: args.deviceName,
					mode: args.mode
				}

				return await channel.sendToQueue(`COMMAND:DEVICE:MODE`, Buffer.from(JSON.stringify(actionRequest)))
			},
			changeDeviceValue: async (root: any, args: {
				deviceId: string, 
				deviceName: string, 
				key: string, 
				value: string
			}, context: any) => {
				
				
				const device = await session.readTransaction(async (tx) => {

					const result = await tx.run(`
						MATCH (device:CommandDevice {id: $id})
						RETURN device{
							.*
						}
					`, {
						id: args.deviceId,
					})
					return result?.records?.[0]?.get(0)
				})

				console.log(args.value)

				let stateChange = {
					address: `opc.tcp://${device.network_name}.hexhive.io:8440`, //opc.tcp://${network_name}.hexhive.io:8440
					busPath: `/Objects/1:Devices/1:${args.deviceName}/1:${args.key}`, ///1:Objects/1:Devices/${TYPE|SERIAL|PORT}/${key}
					value: args.value
				}

				console.log("Sending state change", stateChange)
			
				return await channel.sendToQueue(`COMMAND:DEVICE:VALUE`, Buffer.from(JSON.stringify(stateChange)))
			}
		}
	}
}