/**
 * Submission Gateway - Validates and admits user submissions.
 *
 * This is a stub implementation. Full implementation coming in Phase 2.
 */
import type {
  SubmitIntentInput,
  Submission,
  SubmissionStatus,
} from "./types.js";

export interface SubmissionGateway {
  submitIntent(input: SubmitIntentInput): Promise<Submission>;
  getSubmission(submissionId: string): Promise<Submission | null>;
  cancelSubmission(submissionId: string): Promise<void>;
  listSubmissions(windowId: string, status?: SubmissionStatus): Promise<Submission[]>;
}

export class StubSubmissionGateway implements SubmissionGateway {
  async submitIntent(_input: SubmitIntentInput): Promise<Submission> {
    throw new Error("SubmissionGateway.submitIntent not implemented - Phase 2");
  }

  async getSubmission(_submissionId: string): Promise<Submission | null> {
    throw new Error("SubmissionGateway.getSubmission not implemented - Phase 2");
  }

  async cancelSubmission(_submissionId: string): Promise<void> {
    throw new Error("SubmissionGateway.cancelSubmission not implemented - Phase 2");
  }

  async listSubmissions(_windowId: string, _status?: SubmissionStatus): Promise<Submission[]> {
    throw new Error("SubmissionGateway.listSubmissions not implemented - Phase 2");
  }
}
