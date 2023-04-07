import Fastify, { FastifyInstance } from "fastify";
import filesPlugin from "./src/modules/files/routes.js";

const fastify: FastifyInstance = Fastify({
  logger: true,
});

fastify.register(filesPlugin);

fastify.listen(
  { port: 8080 },
  function (err, address) {
    if (err) {
      fastify.log.error(err);
      process.exit(1);
    }
    console.log('Server is listening on 8080')
  }
);