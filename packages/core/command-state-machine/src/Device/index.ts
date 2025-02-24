import { Mutex } from "locks";
import { CommandClient, CommandStateMachine } from "..";
import { Condition } from "../Condition";
import { State } from "../State";
import { ProgramDevice } from "../types/ProgramDevice";
import { getDeviceFunction } from "./actions";
import { getPluginClass } from "./plugins";

export class StateDevice {
	private device: ProgramDevice;
	
	private mutexLock?: Mutex;

	private lockOwner?: string;

	private controlled: boolean = true;

	private client: CommandClient;

	private fsm: CommandStateMachine;

	private plugins: {instance: any, actions?: {[key: string]: any}, _plugin: any}[] = [];

	private actions: {[key: string]: (state: any, setState: (state: any) => void, requestState: (state: any) => void) => Promise<any>} = {};

	constructor(device: ProgramDevice, fsm: CommandStateMachine, client: CommandClient) {
		this.device = device;

		this.client = client;
		this.fsm = fsm;

		if(device.requiresMutex){
			this.mutexLock = new Mutex();
		}

		this.actions = (device.actions || []).reduce((prev, action) => {
			return {
				...prev,
				[action.key]: getDeviceFunction(action.func)
			}
		}, {})

		// console.log(device.plugins)
		let plugins = (device.plugins || []).map((plugin) => {
			const newClass = getPluginClass(plugin.classString, plugin.imports || [])
			let instance = new newClass(this, plugin.options)

			let actions = plugin.actions?.map((action) => ({
				[action.key]: instance[action.func]
			})).reduce((prev, curr) => ({...prev, ...curr}), {})

			return {
				instance: new newClass(this, plugin.options),
				actions: actions,
				_plugin: plugin
			}
		})

		console.log({plugins})

		this.plugins = plugins //.map((x) => x.instance)
		
		let actions = plugins.map((x) => x.actions).reduce((prev, curr) => ({...prev, ...curr}), {})
		this.actions = {
			...this.actions,
			...actions
		}

		this.setState = this.setState.bind(this);
		this.requestState = this.requestState.bind(this);

		console.log(this.actions)
	}

	//Give plugins a chance to gather data before starting
	//Overwrite device actions so they can be called
	// setupPlugins(){
	// 	this.device.plugins?.forEach(plugin => {
	// 		plugin.setup?.();
	// 	})
	// }

	get name(){
		return this.device.name;
	}

	get isControlled(){
		return this.controlled;
	}

	get hasInterlock(){
		return this.device.interlock != undefined && this.device.interlock.locks.length > 0;
	}

	get requiresMutex(){
		return this.device.requiresMutex;
	}

	get state(){
		return this.fsm.state?.get(this.device.name)
	}

	get globalState(){
		return this.fsm.state
	}

	async performOperation(operation: string){

		let activePlugins = this.plugins.filter((plugin) => {
			if(plugin._plugin.activeWhen){
				return this.fsm.isActive(plugin._plugin.activeWhen)
			}else{
				return true
			}
		})

		//TODO dedupe identical plugins and use highest priority (most conditions met)

		// console.log({activePlugins: activePlugins.map((x) => x._plugin.activeWhen)})
		
		let pluginActions = activePlugins.reduce((prev, curr) => ({
			...prev,
			...curr.actions
		}), {})

		let actions : {[key: string]: any} = {
			...this.actions,
			...pluginActions
		}

		// console.log("Device actions", {actions})

		if(actions[operation]){
			return await actions[operation](this.state, this.setState, this.requestState)
		}else {
			throw new Error(`Operation ${operation} not found`)
		}
		// return await this.client.performOperation({device: this.device.name, operation})
	}

	async setState(state: any){
		console.log("DEVICE - setState", {state})
		await this.fsm.state?.update(this.device.name, state)
	}

	async requestState(state: any){
		console.log("DEVICE - requestState", {state})
		await this.client.requestState({device: this.device.name, state})
	}

	changeControlled(controlled: boolean){
		this.controlled = controlled;
	}

	checkInterlockNeeded(currentState: any){
		let device = this.device.name
		let desiredState = this.device.interlock?.state 

		// console.log(desiredState, currentState)
		let exists = true;

		if(!this.isControlled) return exists;
		
		// console.log("Checking interlock", {device, desiredState, currentState})
		for(var k in desiredState){
			if(`${currentState?.[k]}` !== `${desiredState?.[k]}`){
				exists = false;
				break;
			}
		}
		return exists
	}

	checkCondition(state: State, device: string, deviceKey: string, comparator: string, value: any){
		let cond = new Condition({input: device, inputKey: deviceKey, comparator, value})

		let input = state?.get(device)?.[deviceKey]
		// console.log("Check condition", {input, value}, {device, deviceKey})
		return cond.check(input, value)
	}

	get interlock () {
		return this.device.interlock?.locks
	}

	async checkInterlock(state: any){
		let locks = this.device.interlock?.locks || [];
			
		const lockedUp = await Promise.all(locks.map((lock) => {
			return this.checkCondition(state, lock.device, lock.deviceKey, lock.comparator, lock.value)

		}))

		const locked = lockedUp.includes(false);

		// console.log(state, this.device.name, locked)

		return {locked, lock: locks[lockedUp.indexOf(false)]};
	}

	async lock(){
		await new Promise((resolve, reject) => {
			this.mutexLock!.lock(() => {
				// this.lockOwner = process;
				resolve(true)
			});	
		})
	}

	async unlock(){
		await new Promise((resolve, reject) => {
			// if(this.lockOwner == process){
				this.mutexLock?.unlock()
				resolve(true)
			// }else{
				// reject(new Error("Not lock owner"))
			// }
		})
	}


	async doFallback(lock: any){
		// await this.device.interlock?.locfallback.map(async (operation) => {
			await this.performOperation?.(lock.fallback)
		// })
	}
}