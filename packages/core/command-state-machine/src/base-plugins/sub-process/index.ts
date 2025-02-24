import { CommandAction, Process, ProcessChain } from "@hive-command/process";
import { ProgramProcess } from "../../types";

export const handler = async (
	options: any, 
	hub: {actions: CommandAction[], performOperation: any, getState: any},
	node: ProgramProcess
) => {

	let sub_process = node.sub_processes?.find((a) => a.id == options?.["sub-process"])
	if(sub_process){

		// console.log("Start sub process", sub_process)
		let process = new Process(sub_process, hub.actions, hub.performOperation, hub.getState)

		await process.start()
		// console.log("End sub process", sub_process)
	
	}

}