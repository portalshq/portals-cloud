export type NarrativeMode = "canonical" | "ambient";
export type NarrativeRequest = { channelId: string; mode: NarrativeMode; instructions: string };
export type NarrativeResult = { text: string; imagePrompt?: string; context?: unknown };

export type NarrativeEngineAdapter = {
  generate(request: NarrativeRequest & { entities: readonly unknown[] }): Promise<NarrativeResult>;
};

export type ChannelEntitySource = {
  manifests(channelId: string): readonly unknown[];
};

export type NarrativeProduction = {
  generate(request: NarrativeRequest): Promise<NarrativeResult>;
};

export function createNarrativeProduction(dependencies: {
  engine: NarrativeEngineAdapter;
  entities: ChannelEntitySource;
}): NarrativeProduction {
  return {
    generate(request) {
      return dependencies.engine.generate({ ...request, entities: dependencies.entities.manifests(request.channelId) });
    },
  };
}
