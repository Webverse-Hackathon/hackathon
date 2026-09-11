# worker/
The long-lived process that executes runs. Entrypoint: index.ts.
Pulls from BullMQ, drives the agent loop, publishes step events to Redis, persists every step to
Postgres as it happens so a Redis restart cannot lose the report (F-25).
