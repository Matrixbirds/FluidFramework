/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    ICommittedProposal,
    IProposal,
    ISequencedProposal,
    ITelemetryLogger,
} from "@microsoft/fluid-container-definitions";
import {
    IClientJoin,
    IDocumentAttributes,
    ISequencedClient,
    ISequencedDocumentMessage,
    ISequencedDocumentSystemMessage,
    ISummaryAck,
    ISummaryContent,
    ISummaryNack,
    ISummaryTree,
    MessageType,
    SummaryType,
} from "@microsoft/fluid-protocol-definitions";
import { debug } from "./debug";
import { Quorum } from "./quorum";

export interface IScribeProtocolState {
    sequenceNumber: number;
    minimumSequenceNumber: number;
    members: [string, ISequencedClient][];
    proposals: [number, ISequencedProposal, string[]][];
    values: [string, ICommittedProposal][];
}

export function isSystemMessage(message: ISequencedDocumentMessage) {
    switch (message.type) {
        case MessageType.ClientJoin:
        case MessageType.ClientLeave:
        case MessageType.Propose:
        case MessageType.Reject:
        case MessageType.NoOp:
        case MessageType.Summarize:
        case MessageType.SummaryAck:
        case MessageType.SummaryNack:
            return true;
        default:
            return false;
    }
}

export class ProtocolOpHandler {
    public readonly quorum: Quorum;

    constructor(
        private readonly branchId: string,
        public minimumSequenceNumber: number,
        public sequenceNumber: number,
        members: [string, ISequencedClient][],
        proposals: [number, ISequencedProposal, string[]][],
        values: [string, ICommittedProposal][],
        sendProposal: (key: string, value: any) => number,
        sendReject: (sequenceNumber: number) => void,
        private readonly logger?: ITelemetryLogger,
    ) {
        this.quorum = new Quorum(minimumSequenceNumber, members, proposals, values, sendProposal, sendReject, logger);
    }

    public close() {
        this.quorum.close();
    }

    public processMessage(message: ISequencedDocumentMessage, local: boolean) {
        switch (message.type) {
            case MessageType.ClientJoin:
                const systemJoinMessage = message as ISequencedDocumentSystemMessage;
                const join = JSON.parse(systemJoinMessage.data) as IClientJoin;
                const member: ISequencedClient = {
                    client: join.detail,
                    sequenceNumber: systemJoinMessage.sequenceNumber,
                };
                this.quorum.addMember(join.clientId, member);

                break;

            case MessageType.ClientLeave:
                const systemLeaveMessage = message as ISequencedDocumentSystemMessage;
                const clientId = JSON.parse(systemLeaveMessage.data) as string;
                this.quorum.removeMember(clientId);
                break;

            case MessageType.Propose:
                const proposal = message.contents as IProposal;
                this.quorum.addProposal(
                    proposal.key,
                    proposal.value,
                    message.sequenceNumber,
                    local,
                    message.clientSequenceNumber);
                break;

            case MessageType.Reject:
                const sequenceNumber = message.contents as number;
                this.quorum.rejectProposal(message.clientId, sequenceNumber);
                break;

            case MessageType.Summarize:
                if (this.logger) {
                    this.logger.sendTelemetryEvent({
                        eventName: "Summarize",
                        summaryContent: message.contents as ISummaryContent,
                    });
                }
                debug("MessageType.Summarize", message.contents);
                break;

            case MessageType.SummaryAck:
                if (this.logger) {
                    this.logger.sendTelemetryEvent({
                        eventName: "SummaryAck",
                        summaryAck: message.contents as ISummaryAck,
                    });
                }
                debug("MessageType.SummaryAck", message.contents);
                break;

            case MessageType.SummaryNack:
                if (this.logger) {
                    this.logger.sendTelemetryEvent({
                        eventName: "SummaryNack",
                        summaryNack: message.contents as ISummaryNack,
                    });
                }
                debug("MessageType.SummaryNack", message.contents);
                break;

            default:
        }

        // Update tracked sequence numbers
        this.minimumSequenceNumber = message.minimumSequenceNumber;
        this.sequenceNumber = message.sequenceNumber;

        // Notify the quorum of the MSN from the message. We rely on it to handle duplicate values but may
        // want to move that logic to this class.
        this.quorum.updateMinimumSequenceNumber(message);
    }

    public getProtocolState(): IScribeProtocolState {
        const quorumSnapshot = this.quorum.snapshot();

        return {
            members: quorumSnapshot.members,
            minimumSequenceNumber: this.minimumSequenceNumber,
            proposals: quorumSnapshot.proposals,
            sequenceNumber: this.sequenceNumber,
            values: quorumSnapshot.values,
        };
    }

    public captureSummary(): ISummaryTree {
        // These fields can easily be tracked on the server
        const quorumSnapshot = this.quorum.snapshot();

        // Save attributes for the document
        const documentAttributes: IDocumentAttributes = {
            branch: this.branchId,
            minimumSequenceNumber: this.minimumSequenceNumber,
            sequenceNumber: this.sequenceNumber,
        };

        const summary: ISummaryTree = {
            tree: {
                ".attributes": {
                    content: JSON.stringify(documentAttributes),
                    type: SummaryType.Blob,
                },
                "quorumMembers": {
                    content: JSON.stringify(quorumSnapshot.members),
                    type: SummaryType.Blob,
                },
                "quorumProposals": {
                    content: JSON.stringify(quorumSnapshot.proposals),
                    type: SummaryType.Blob,
                },
                "quorumValues": {
                    content: JSON.stringify(quorumSnapshot.values),
                    type: SummaryType.Blob,
                },
            },
            type: SummaryType.Tree,
        };

        return summary;
    }
}
