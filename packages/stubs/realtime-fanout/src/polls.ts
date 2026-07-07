import { FanoutBus } from "./fanout-bus";

export interface Poll {
  sessionId: string;
  pollId: string;
  question: string;
  options: string[];
}

export interface PollVote {
  pollId: string;
  voterId: string;
  optionIndex: number;
}

export class Polls {
  constructor(private bus: FanoutBus) {}

  async open(poll: Poll): Promise<void> {
    await this.bus.publish(`poll:${poll.sessionId}:opened`, poll);
  }

  async vote(vote: PollVote): Promise<void> {
    // TODO: dedupe by voterId, persist tally to world store
    await this.bus.publish(`poll:${vote.pollId}:vote`, vote);
  }

  async close(sessionId: string, pollId: string): Promise<{ tally: Record<number, number> }> {
    throw new Error("Polls.close: tally aggregation not yet implemented");
  }
}
