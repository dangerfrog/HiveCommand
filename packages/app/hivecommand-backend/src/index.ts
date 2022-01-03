import { config } from 'dotenv'
config()

import { HiveGraph } from '@hexhive/graphql-server'

import amqp from 'amqplib'

import express from 'express';
import neo4j from "neo4j-driver"
import { Neo4jGraphQL } from "@neo4j/graphql"
import { graphqlHTTP } from "express-graphql"
import { connect_data } from '@hexhive/types';
import typeDefs from './schema'
import resolvers from './resolvers';
import { Pool } from 'pg';

(async () => {


	await connect_data()
	
	const driver = neo4j.driver(
		process.env.NEO4J_URI || "localhost",
		neo4j.auth.basic(process.env.NEO4J_USER || "neo4j", process.env.NEO4J_PASSWORD || "test")
	)

	const pool = new Pool({
		host: process.env.TIMESERIES_HOST || 'localhost',
		user: process.env.TIMESERIES_USER || 'postgres',
		password: process.env.TIMESERIES_PASSWORD || 'quest',
		port: 5432,
		connectionTimeoutMillis: 60 * 1000
	})

	const mq = await amqp.connect(
		process.env.RABBIT_URL || 'amqp://localhost'
	)

	console.log("RabbitMQ")

	const mqChannel = await mq.createChannel()

	await mqChannel.assertQueue(`COMMAND:DEVICE:CONTROL`)
	await mqChannel.assertQueue(`COMMAND:DEVICE:MODE`);
	await mqChannel.assertQueue(`COMMAND:FLOW:PRIORITIZE`);


	const resolved = await resolvers(driver.session(), pool, mqChannel)

	const neoSchema : Neo4jGraphQL = new Neo4jGraphQL({ typeDefs, resolvers: resolved, driver })

	const graphServer = new HiveGraph({
		rootServer: process.env.ROOT_SERVER || 'http://localhost:7000',
		schema: neoSchema.schema
	})

	await graphServer.init()

	const app = express()

	app.use(graphServer.middleware)

	app.listen('9010')

})()