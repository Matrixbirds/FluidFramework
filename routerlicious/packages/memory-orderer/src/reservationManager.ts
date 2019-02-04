import { ICollection, MongoManager } from "@prague/services-core";
import { EventEmitter } from "events";
import { IConcreteNode, IReservationManager } from "./interfaces";
import { NodeManager } from "./nodeManager";

/**
 * Reservation for the given id within the system. The reservation is considered held for as long as the node
 * maintains the given epoch
 */
interface IReservation {
    _id: string;

    node: string;
}

export class ReservationManager extends EventEmitter implements IReservationManager {
    constructor(
        private nodeTracker: NodeManager,
        private mongoManager: MongoManager,
        private reservationColletionName: string) {
        super();
    }

    public async getOrReserve(key: string, node: IConcreteNode): Promise<IConcreteNode> {
        const reservations = await this.getReservationsCollection();
        const reservation = await reservations.findOne({ _id: key });

        // Reservation can be null (first time), expired, or existing and within the time window
        if (reservation === null) {
            await this.makeReservation(node, key, null, reservations);
            return node;
        } else {
            const remoteNode = await this.nodeTracker.loadRemote(reservation.node);
            if (remoteNode.valid) {
                return remoteNode;
            } else {
                await this.makeReservation(node, key, reservation, reservations);
                return node;
            }
        }
    }

    private async makeReservation(
        node: IConcreteNode,
        key: string,
        existing: IReservation,
        collection: ICollection<IReservation>): Promise<any> {

        const newReservation: IReservation = { _id: key, node: node.id };

        if (existing) {
            await collection.update(
                { _id: key, node: existing.node },
                newReservation,
                null);
        } else {
            await collection.insertOne(newReservation);
        }
    }

    private async getReservationsCollection(): Promise<ICollection<IReservation>> {
        const db = await this.mongoManager.getDatabase();
        return db.collection<IReservation>(this.reservationColletionName);
    }
}
