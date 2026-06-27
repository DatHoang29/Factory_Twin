import Redis from 'ioredis';

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

export const redisClient = new Redis(redisUrl, { maxRetriesPerRequest: null });
export const redisPub = new Redis(redisUrl, { maxRetriesPerRequest: null });
export const redisSub = new Redis(redisUrl, { maxRetriesPerRequest: null });
