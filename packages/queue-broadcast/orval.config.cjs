module.exports = {
  queueBroadcast: {
    input: {
      target: "../../../streamer/openapi.json",
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
