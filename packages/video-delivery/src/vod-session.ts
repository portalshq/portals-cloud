export interface VodAsset {
  assetId: string;
  playbackManifestUrl: string;
  durationSeconds: number;
}

export class VodDelivery {
  async getAsset(assetId: string): Promise<VodAsset> {
    throw new Error("VodDelivery.getAsset: not yet wired to object storage / Akamai edge");
  }
}
