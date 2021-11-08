export interface PayloadResponse {
	payload?: {
		command: CommandPayloadItem[],
		layout?: AssignmentPayload[]
	}
}

export interface CommandPayloadItem {
	
		name: string,
		id: string,
		parent: {
			id: string,
			name: string
		} | null,
		nodes: {
			id: string;
			type: string;
			configuration?: {
				key: string;
				value: string;
			}[];
			subprocess?: {
				id: string,
				name: string,
			}
			actions?: {
				key: string,
				target: string
				release?: boolean;
			}[],
			next: {
				target: string,
				id: string,
				sourceHandle: string,
				targetHandle: string,
				conditions?: {
					input: string,
					inputKey: string,
					comparator: string,
					assertion: string,
				}[]
			}[]
		}[]
	
}

export interface AssignmentPayload {
	actions?: {key: string, func: string}[]
	plugins?: {
		id: string, 
		name: string, 
		instance: any,
		tick: string,
		configuration: {
			key: string,
			value: string
		}[]
	}[]
	state?: AssignmentState[]
	requiresMutex: boolean;
	type: string;
	port: string
	bus: string
	id: string
	name: string
}

export interface AssignmentState {
	id: string;
	key: string;
	type: string;
	min?: number;
	max?: number;
	foreignKey: string;
}