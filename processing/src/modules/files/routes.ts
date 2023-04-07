import { FastifyPluginCallback } from 'fastify';
import { Client } from 'ssh2';

const plugin: FastifyPluginCallback = (fastify, options, done) => {
  fastify.get('/list-files', async (request, reply) => {
    const conn = new Client();

    await conn.connect({
      host: '64.226.65.87',
      port: 22,
      username: 'root',
      password: 'DZFGe48se4tst'
    });

    console.log('Client :: ready');

    const sftp = await conn.sftp({});

    const files = await new Promise<string[]>((resolve, reject) => {
      sftp.readdir('/remote/path', (err, list) => {
        if (err) reject(err);
        resolve(list.map((file) => file.filename));
      });
    });

    console.log(files);

    conn.end();

    reply.send(files);
  });

  done();
};

export default plugin;
