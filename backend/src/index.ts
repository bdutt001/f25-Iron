import dotenv from "dotenv";
import { createServer } from "http";
import app from "./app";
import { startMessageHub } from "./realtime/messageHub";

dotenv.config();

const PORT = process.env.PORT || 8000;
const server = createServer(app);

startMessageHub(server);

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

