// Market Data Collector — Module 5: Protobuf Decoding Boundary
// Implements WBS 4.3 and complies with COLLECTOR_ARCHITECTURE_SPECIFICATION.md & COLLECTOR_DATA_SCHEMA.md.

import { decodeFeedResponse, encodeFeedResponse } from "../lib/liveEvidence/wsDecoder.ts";

export interface DecodeSuccessResult {
  ok: true;
  payload: Record<string, unknown>;
  rawByteLength: number;
}

export interface DecodeFailureResult {
  ok: false;
  error: string;
  rawByteLength: number;
  bytePreviewHex: string;
}

export type DecodeResult = DecodeSuccessResult | DecodeFailureResult;

export class ProtobufDecoder {
  private totalFramesDecoded = 0;
  private totalDecodeErrors = 0;
  private recentQuarantineFrames: Array<{
    timestamp: string;
    byteLength: number;
    preview: string;
    error: string;
  }> = [];

  /**
   * Decodes a binary Protobuf frame inside an isolated try/catch boundary.
   * Prevents malformed binary frames from crashing the event loop.
   */
  public decode(bytes: Uint8Array): DecodeResult {
    const rawByteLength = bytes.byteLength;
    try {
      if (!bytes || rawByteLength === 0) {
        throw new Error("EMPTY_BINARY_FRAME: 0 bytes received");
      }
      const payload = decodeFeedResponse(bytes);
      this.totalFramesDecoded++;
      return {
        ok: true,
        payload,
        rawByteLength,
      };
    } catch (err: unknown) {
      this.totalDecodeErrors++;
      const errorMessage = err instanceof Error ? err.message : String(err);
      const bytePreviewHex = Buffer.from(bytes.slice(0, 32)).toString("hex");

      this.recentQuarantineFrames.push({
        timestamp: new Date().toISOString(),
        byteLength: rawByteLength,
        preview: bytePreviewHex,
        error: errorMessage,
      });

      // Keep recent quarantine queue bounded to 100 items
      if (this.recentQuarantineFrames.length > 100) {
        this.recentQuarantineFrames.shift();
      }

      return {
        ok: false,
        error: errorMessage,
        rawByteLength,
        bytePreviewHex,
      };
    }
  }

  /**
   * Encodes a mock FeedResponse object for testing.
   */
  public encodeMock(payload: Record<string, unknown>): Uint8Array {
    return encodeFeedResponse(payload);
  }

  public getStats() {
    return {
      totalFramesDecoded: this.totalFramesDecoded,
      totalDecodeErrors: this.totalDecodeErrors,
      recentQuarantineFramesCount: this.recentQuarantineFrames.length,
    };
  }

  public getRecentQuarantinedFrames() {
    return [...this.recentQuarantineFrames];
  }
}
