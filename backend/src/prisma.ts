import { config as loadEnv } from "dotenv";
import { PrismaClient } from "@prisma/client";

loadEnv();

const prisma = new PrismaClient();

export default prisma;
