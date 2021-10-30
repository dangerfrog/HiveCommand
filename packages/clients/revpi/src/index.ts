import { CommandIdentity } from '@hive-command/identity'
import { CommandStateMachine, ProcessNode } from '@hive-command/state-machine'
import { CommandLogging } from '@hive-command/logging'
import { AssignmentPayload, CommandNetwork, PayloadResponse } from '@hive-command/network'
import IOLinkPlugin from './plugins/IO-Link';
import RevPiPlugin from './plugins/RevPi';
import { BasePlugin } from './plugins/Base';
import IODDManager, { IODD } from '@io-link/iodd'
import { ValueBank } from './io-bus/ValueBank';
import { getDeviceFunction, getPluginFunction } from './device-types/AsyncType';
import { nanoid } from 'nanoid';
import { DeviceMap } from './io-bus/DeviceMap';

export interface CommandEnvironment {
	id: string;
	type: string;
	name: string;
	devices?: {ix: number, product: string, inputs?: any[], outputs?: any[], iodd: any}[];
}

export interface CommandClientOptions {
	networkInterface?: string;
	storagePath?: string
	commandCenter? : string
	privateKey?: string
	discoveryServer?: string
}

export class CommandClient { 

	private environment : CommandEnvironment[] = [];

	private plugins : BasePlugin[];

	private machine? : CommandStateMachine;

	private logs : CommandLogging;

	private network : CommandNetwork;

	private identity : CommandIdentity;

	private ioddManager : IODDManager;

	// private valueBank : ValueBank;

	private options : CommandClientOptions;

	private cycleTimer?: any;

	private deviceMap : DeviceMap;
	// private portAssignment: AssignmentPayload[] = []

	constructor(opts: CommandClientOptions){
		this.options = opts;

		this.deviceMap = new DeviceMap();
		// this.valueBank = new ValueBank();

		// this.valueBank.on('REQUEST_STATE', this.requestState.bind(this))

		this.ioddManager = new IODDManager({
			storagePath: opts.storagePath || '/tmp'
		})

		this.plugins = [
			new IOLinkPlugin(opts.networkInterface || 'eth0', this.ioddManager),
			new RevPiPlugin()
		]

		this.logs = new CommandLogging();

		this.logs.log(`Starting Command Client...`);

		this.identity = new CommandIdentity();
		
		if(!this.identity) throw new Error("Unable to find credentials");

		this.logs.log(`Found credentials for control surface...`);

		this.logs.log(`Starting network...`);

		this.network = new CommandNetwork({
			baseURL: opts.commandCenter, 
			valueBank: this.machine?.state
		});

		this.requestOperation = this.requestOperation.bind(this);
		// this.machine = new CommandStateMachine({
			
		// });

		// this.readEnvironment = this.readEnvironment.bind(this);
	}

	async requestState(event: {bus: string | null, port: string, value: any}){
		let busDevice = this.environment.find((a) => a.id == event.bus)
		let plugin = this.plugins.find((a) => a.TAG == busDevice?.type)
		console.log("REQUESTING STATE FROM ", event.bus, event.port, event.value)
		
		if(!event.bus) return;

		//An object value is a partial state to merge before sending else its a value
		if(typeof(event.value) == "object"){
			let deviceName = this.deviceMap.getDeviceName(event.bus, event.port)
			if(!deviceName) return;
			let prevState = this.machine?.state.get(deviceName)
			// let prevState = this.valueBank.get(event.bus, event.port)
			event.value = {
				...prevState,
				...event.value
			}
		}
		
		await plugin?.write(event.bus, event.port, event.value);
	}

	setState(device: string, state: any){
		// const busPort = this.deviceMap.getDeviceBusPort(device)

		this.machine?.state.update(device, {
			...state
		})
	}

	async useAction(device: string, operation: any){
		const busPort = this.deviceMap.getDeviceBusPort(device)

		if(busPort?.bus && busPort?.port){
			/*
				Test the operation value for object type
				if object remap keys to busmap keys
				if value write directly
			*/
			
			let writeOp: any;

			if(typeof(operation) == 'object'){
				writeOp = {};
				for(var k in operation){
					let stateItem = busPort.state?.find((a) => a.key == k)
					if(!stateItem) continue;
					writeOp[stateItem?.foreignKey] = operation[k];
				}

			}else{
				writeOp = operation;
			}

			// await this.requestState({
			// 	bus: busPort?.bus,
			// 	port: busPort?.port,
			// 	value: writeOp
			// })
			console.log("OP", writeOp)

		}
	}

	//Request state + translator for name
	async requestOperation(event: {device: string, operation: string}){
		console.log("Requesting operation with device name - StateMachine")
		let busPort = this.deviceMap.getDeviceBusPort(event.device)
		
		if(!busPort?.bus || !busPort.port) return new Error("No bus-port found");

		let action = busPort.actions?.find((a) => a.key == event.operation)
		console.log("Found action", action)
		if(!action?.func) return;

		let driverFunction = getDeviceFunction(action?.func)
		
		let id = nanoid();
		console.time(`${id}-${action.key}`)
		await driverFunction(
			{},
			(state: any) => this.setState(event.device, state),
			(operation: any) => this.useAction(event.device, operation)	
		)
		console.timeEnd(`${id}-${action.key}`)

		// console.log("Finished driver func", action.key)

		// this.requestState({
		// 	bus: busPort?.bus,
		// 	port: busPort?.port,
		// 	value: event.operation
		// })
	}

	async discoverEnvironment(){
		//Run discovery for all loaded plugins
		let environment = await Promise.all(this.plugins.map(async (plugin) => {
			const discovered = await plugin.discover()

			console.log("Discovered Plugin Environment", discovered);
			return {
				plugin: plugin.TAG,
				discovered
			}
		}))
		return environment.reduce<{type: string, id: string, name: string}[]>((prev, curr) => {
			return prev.concat(curr.discovered.map((x: any) => ({...x, type: curr.plugin})))
		}, [])
	}

	// async readEnvironment(env: {type: string, id: string, name: string}[]){
	// 	const envValue = await Promise.all(env.map(async (bus) => {
	// 		let plugin = this.plugins.find((a) => a.TAG == bus.type)

	// 		const value = await plugin?.read(bus.id)
	// 		if(!value) return
	// 		this.valueBank.setMany(bus.id, value); //[bus.id] = value || [];
	// 		return value;
	// 	}))
	// 	console.log("ENV VALUE", envValue)
	// 	return envValue
	// }	

	// startCyclicRead(cycle_time: number = 10 * 1000){
	// 	this.cycleTimer = setInterval(() => this.readEnvironment(this.environment), cycle_time)
	// }

	// stopCyclicRead(){
	// 	clearInterval(this.cycleTimer)
	// }

	async discoverSelf(){
		//Discover the identity of the self
		return await this.network.whoami()
	}

	async subscribeToBusSystem(env: {type: string, id: string, name: string}[]){
		await Promise.all(env.map(async (bus) => {
			let plugin = this.plugins.find((a) => a.TAG == bus.type)

			await plugin?.subscribe(bus.id)

			//TODO DEDUPE this
			plugin?.on('PORT:VALUE', (event) => {
				let device = this.deviceMap.getDeviceByBusPort(event.bus, event.port)
			
				if(!device) return;
				let cleanState = event.value;
				if(typeof(event.value) == "object"){

					cleanState = device.state?.reduce((prev, curr) => {
						return {
							...prev,
							[curr.key]: event.value[curr.foreignKey]
						}
					}, {})

				}

				this.machine?.state.update(device?.name, cleanState)
				// this.valueBank.set(event.bus, event.port, event.value)
			})
		}))
	}

	getBlockType(type: string){
		console.log("Get TYpe", type)
		switch(type){
			case 'Trigger':
			case 'Action':
				return 'action';
			case 'Clock':
				return 'timer';
			case 'Cycle':
				return 'action'; //TODO pid
		}
	}

	async loadMachine(commandPayload: PayloadResponse){
		let payload = commandPayload.payload?.command;
		let layout = commandPayload.payload?.layout;

		if(layout) this.deviceMap.setAssignment(layout); //this.portAssignment = layout;

		await this.loadPlugins(commandPayload.payload?.layout || []);

		let nodes = (payload || []).map((action) : ProcessNode => {
			let deviceId = action.configuration?.find((a) => a.key == 'device')?.value;
			let operation = action.configuration?.find((a) => a.key == 'operation')?.value;

			let actions = action.actions?.map((action) => ({
				device: action.target,
				operation: action.key
			}))

			// if(deviceId && operation){
			// 	actions.push({device: deviceId, operation})
			// }

			return {
				id: action.type == "Trigger" ? "origin" : action.id,
				extras: {
					blockType: this.getBlockType(action.type) || 'action',
					timer: action.configuration?.find((a) => a.key == 'timeout')?.value,
					actions: actions
				}
			}
		}).reduce((prev, curr) => {
			return {
				...prev,
				[curr.id]: curr
			}
		}, {})

		console.log(JSON.stringify(nodes))

		let paths = payload?.map((action) => {
			return action.next?.map((next) => {
				return {
					id: next.id,
					source: action.type == "Trigger" ? 'origin' : action.id,
					target: next.target,
					extras: {
                        conditions: next.conditions?.map((cond) => ({
							input: cond.input,
							inputKey: cond.inputKey,
							comparator: cond.comparator,
							value: cond.assertion
						}))
	
                    }
				}
			})
			
		}).reduce((prev, curr) => {
			return prev.concat(curr)
		}, []).filter((a) => a).reduce((prev, curr) => {
			return {
				...prev,
				[curr.id]: curr
			}
		}, {})

		console.log(`Received command payload, starting state machine`)
		this.machine = new CommandStateMachine({
			processes: [{
				id: 'default',
				name: 'Default',
				nodes: nodes,
				links: paths,
				sub_processes: []
			}]
		}, {
			performOperation: this.requestOperation
		})

		// this.machine.on('REQUEST:OPERATION', this.requestOperation)
		
		this.machine.start()

		this.machine.on('TICK', async () => {
			await Promise.all(this.deviceMap.getDevicesWithPlugins().map(async (device) => {
				await Promise.all((device?.plugins || []).map(async (plugin) => {

					let pluginObject = plugin.configuration.reduce<{
						targetDevice?: string;
						targetDeviceField?: string;
						actuator?: string;
						actuatorField?: string;
					}>((prev, curr) => ({...prev, [curr.key]: curr.value}), {})

					if(plugin.instance){
						const pluginTick = getPluginFunction(plugin.tick)
						if(!pluginObject.targetDevice || !pluginObject.actuator) return;

						let targetDevice = this.deviceMap.getDeviceById(pluginObject.targetDevice)
						let actuatorDevice = this.deviceMap.getDeviceById(pluginObject.actuator)
						if(!targetDevice || !actuatorDevice) return;
						
					

						let actuatorKey = actuatorDevice.state?.find((a) => a.key == pluginObject.actuatorField)
						let targetKey = targetDevice.state?.find((a) => a.key == pluginObject.targetDeviceField)

						if(!actuatorKey || !targetKey) return;
						let actuatorValue = this.machine?.state.getByKey(actuatorDevice.name, actuatorKey?.key)
						let targetValue = this.machine?.state.getByKey(targetDevice.name, targetKey?.key)

						console.log(`Host: ${device.name}`, this.machine?.state.get(device.name))
						let state = {
							actuatorValue: actuatorValue || 0,
							targetValue:  targetValue || 0,
							__host: {
								...this.machine?.state.get(device.name)
							}
						}

						// console.log("PLUGIN STATE", state, actuatorValue, targetValue)

						pluginTick(plugin.instance, state, async (state) => {

							console.log("REQUEST STATE", state)

							let value = state.actuatorValue;
							let key = device.state?.find((a) => a.key == pluginObject.actuatorField)

							console.log("KV", key, value)
							if(!key) return;
							let writeOp: any = {
								[key?.foreignKey]: value
							};

							console.log("WRITE", writeOp)
							await this.requestState({
								bus: device?.bus,
								port: device?.port,
								value: writeOp
							})

						})
					}
					// console.log("PLugin tick ", plugin.name)
				}))
			}))
		})

		console.log(`State machine started`)
	}

	async loadPlugins(payload: AssignmentPayload[]){
		//Init all plugins for all ports
		await Promise.all(this.deviceMap.getDevicesWithPlugins().map(async (device) => {

			this.deviceMap.setupDevicePlugins(device.id)
			
		}))
	}

	async start(){
		//Find IO-Buses and Connected Devices
		this.environment = await this.discoverEnvironment()

		this.logs.log(`Found environment ${JSON.stringify(this.environment)}`)

		//Find self identity
		const self = await this.discoverSelf()

		if(!self.identity?.named) throw new Error("No self found, check credentials");

		await this.network.provideContext(this.environment, this.identity.identity)

		this.logs.log(`Found self ${JSON.stringify(self)}`)
		const credentials = await this.network.becomeSelf(self)

		this.logs.log(`Found credentials ${JSON.stringify(credentials)}`)

		//Get our command payload

		const commandPayload = await this.network.getPurpose()
		if(commandPayload.payload){

			if(commandPayload.payload.layout){

				await this.network.start({
					hostname: self.identity.named,
					discoveryServer: this.options.discoveryServer
				}, commandPayload.payload.layout)
			}
			await this.loadMachine(commandPayload)
		}


		//Start network and share context with the mothership
		// await this.network.start({
		// 	hostname: self.identity?.named,
		// 	discoveryServer: this.options.discoveryServer,
		// })

		await this.subscribeToBusSystem(this.environment);

		// this.startCyclicRead()

		// await this.readEnvironment(this.environment)
	}
}
