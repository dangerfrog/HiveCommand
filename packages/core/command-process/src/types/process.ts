export interface CommandProcess {
	id?: string;
	name?: string;
	nodes?: CommandProcessNode[];
	edges?: CommandProcessEdge[];

	sub_processes?: CommandProcess[];
}

export interface CommandProcessEdge {
	source: string;
	target: string;
}

export interface CommandProcessNode {
	id: string;
	type: string;
	options?: any;
}