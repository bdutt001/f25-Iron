process.env.NODE_ENV = process.env.NODE_ENV ?? "test";

// Keep jest tests deterministic and fail quickly when promises hang.
jest.setTimeout(30000);
