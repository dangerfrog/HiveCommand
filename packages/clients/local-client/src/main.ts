import { readFileSync } from "fs";
import { CommandClient } from ".";

const pkg = require('../package.json');

console.info(`Starting HiveCommand Pilot v${pkg.version}`);
	
let key = readFileSync('/home/pi/hivecommand.key', 'utf8')


	const hostCommander = new CommandClient({
		storagePath: '/tmp',
		commandCenter: 'http://discovery.hexhive.io:8080',
		healthCenter: `ws://discovery.hexhive.io:8080`,
		privateKey: key,
		networkInterface: 'eth0',
		discoveryServer: 'opc.tcp://discovery.hexhive.io:4840'
	})

	hostCommander.start().then(() => {
		// process.exit(0);
	}).catch((err) => {
		console.log(err)
	})