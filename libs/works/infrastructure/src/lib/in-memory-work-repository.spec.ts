import { InMemoryWorkRepository } from './in-memory-work-repository.js';
import { workRepositoryContract } from './work-repository.contract.js';

workRepositoryContract('InMemoryWorkRepository', async () => new InMemoryWorkRepository());
