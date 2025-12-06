import dotenv from "dotenv";
import { createServer } from "http";
import app from "./app";
import { startMessageHub } from "./realtime/messageHub";

dotenv.config();

const PORT = Number(process.env.PORT) || 8000;
const server = createServer(app);

startMessageHub(server);

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
});

