module.exports = {
  queueBroadcast: {
    input: {
      target: "./openapi/streamer.json",
    },
    output: {
      target: "src/generated/api.ts",
      client: "fetch",
      mode: "single",
      baseUrl: "",
      clean: true,
      prettier: true,
    },
  },
};
