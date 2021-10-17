import { CommandIdentity } from '@hive-command/identity'
import { CommandStateMachine } from '@hive-command/state-machine'
import { CommandLogging } from '@hive-command/logging'
import { CommandNetwork } from '@hive-command/network'
import IOLinkPlugin from './plugins/IO-Link';
import RevPiPlugin from './plugins/RevPi';
import { BasePlugin } from './plugins/Base';
import IODDManager from '@io-link/iodd'
import { ValueBank } from './io-bus/ValueBank';

export interface CommandClientOptions {
	networkInterface?: string;
	storagePath?: string
	commandCenter? : string
	privateKey?: string
	discoveryServer?: string
}

export class CommandClient { 

	private plugins : BasePlugin[];

	private machine : CommandStateMachine;

	private logs : CommandLogging;

	private network : CommandNetwork;

	private identity : CommandIdentity;

	private ioddManager : IODDManager;

	private valueBank : ValueBank;

	constructor(opts: CommandClientOptions){

		this.valueBank = new ValueBank();

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
			valueBank: this.valueBank
		});

		this.machine = new CommandStateMachine();
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

	async readEnvironment(env: {type: string, id: string, name: string}[]){
		const envValue = await Promise.all(env.map(async (bus) => {
			let plugin = this.plugins.find((a) => a.TAG == bus.type)

			const value = await plugin?.read()
			if(!value) return
			this.valueBank.setMany(bus.id, value); //[bus.id] = value || [];
			return value;
		}))
		console.log("ENV VALUE", envValue)
		return envValue
	}	

	async discoverSelf(){
		//Discover the identity of the self
		return await this.network.whoami()
	}

	async start(){
		//Find IO-Buses and Connected Devices
		const environment = await this.discoverEnvironment()

		this.logs.log(`Found environment ${JSON.stringify(environment)}`)

		//Find self identity
		const self = await this.discoverSelf()

		if(!self.identity?.named) throw new Error("No self found, check credentials");

		await this.network.provideContext(environment, this.identity.identity)

		this.logs.log(`Found self ${JSON.stringify(self)}`)
		const credentials = await this.network.becomeSelf(self)

		this.logs.log(`Found credentials ${JSON.stringify(credentials)}`)
		//Start network and share context with the mothership
		await this.network.start({hostname: self.identity?.named})

		await this.readEnvironment(environment)
	}
}
