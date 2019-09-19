/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { Deferred } from "@microsoft/fluid-core-utils";
import { ChildProcess, fork } from "child_process";
import { Provider } from "nconf";
import * as winston from "winston";
import { IIncomingMessage as IOutgoingChildMessage, IOutgoingMessage as IIncomingChildMessage } from "./childLoader";

export class KeyValueWrapper {
    private readonly kvDeferred = new Deferred<void>();
    private keyValue: ChildProcess;

    constructor(config: Provider) {
        const keyValueLoaderFile = `${__dirname}/childLoader.js`;
        winston.info(`Forking ${keyValueLoaderFile}`);
        this.keyValue = fork(keyValueLoaderFile);
        const outgoingMessage: IOutgoingChildMessage = {
            type: "init",
            param: {
                documentUrl: config.get("keyValue:documentUrl"),
                gatewayKey: config.get("gateway:key"),
                gatewayUrl: config.get("worker:gatewayUrl"),
            },
        };
        this.keyValue.once("message", (message: IIncomingChildMessage) => {
            if (message.type === "init") {
                message.status ? this.kvDeferred.resolve() : this.kvDeferred.reject(message.value);
            }
        });
        this.keyValue.send(outgoingMessage);
    }

    public async get(key: string) {
        return new Promise<any>((resolve, reject) => {
            this.kvDeferred.promise.then(() => {
                const outgoingMessage: IOutgoingChildMessage = {
                    type: "get",
                    param: key,
                };
                this.keyValue.once("message", (message: IIncomingChildMessage) => {
                    if (message.type === "get") {
                        message.status ? resolve(message.value) : reject(message.status);
                    }
                });
                this.keyValue.send(outgoingMessage);
            }, (err) => {
                reject(err);
            });
        });
    }
}
