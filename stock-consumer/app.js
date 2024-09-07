"use strict";

const { MongoClient } = require('mongodb');
const amqplib = require('amqplib');

const RABBITMQ_URL = process.env.RABBITMQ_URL;
const MONGODB_URL = process.env.MONGODB_URL;
const MONGODB_DB = process.env.MONGODB_DB ?? 'stockmarket';
const MONGODB_COLLECTION = process.env.MONGODB_COLLECTION ?? 'stocks';
const QUEUE_NAME = process.env.QUEUE_NAME;

let prices = [];
async function processMessage(collection, message) {
    const data = JSON.parse(message.content.toString());
    prices.push(data.price);

    if (prices.length < 1000) {
        return;
    }

    const currentPrices = prices;
    prices = [];

    let sum = 0;
    for (const price of currentPrices) {
        sum += price;
    }
    const avgPrice = sum / currentPrices.length;

    const updateResult = await collection.updateOne({
        company: data.company
    }, {
        $set: {
            company: data.company,
            avgPrice: avgPrice
        }
    }, {
        upsert: true
    });

    console.log(avgPrice, updateResult);
}

async function main() {
    if (!RABBITMQ_URL || !MONGODB_URL || !QUEUE_NAME || !MONGODB_DB || !MONGODB_COLLECTION) {
        throw new Error('Missing environment variables');
    }

    console.log("Will use the following environment variables:");
    console.log("RABBITMQ_URL:", RABBITMQ_URL);
    console.log("MONGODB_URL:", MONGODB_URL);
    console.log("MONGODB_DB:", MONGODB_DB);
    console.log("MONGODB_COLLECTION:", MONGODB_COLLECTION);
    console.log("QUEUE_NAME:", QUEUE_NAME);

    console.log("Connecting to MongoDB");
    const client = await MongoClient.connect(MONGODB_URL);
    const db = client.db(MONGODB_DB);
    const collection = db.collection(MONGODB_COLLECTION);

    console.log("Connecting to RabbitMQ");
    const conn = await amqplib.connect(RABBITMQ_URL);

    const channel = await conn.createChannel();
    await channel.assertQueue(QUEUE_NAME, {
        durable: false
    });

    console.log("Waiting for messages");
    channel.consume(QUEUE_NAME, async (message) => {
        if (message === null) {
            return;
        }

        channel.ack(message);
        await processMessage(collection, message);
    }, {
        noAck: false
    });
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
