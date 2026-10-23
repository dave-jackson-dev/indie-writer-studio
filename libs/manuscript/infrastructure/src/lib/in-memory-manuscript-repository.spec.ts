import { InMemoryManuscriptRepository } from './in-memory-manuscript-repository.js';
import { manuscriptRepositoryContract } from './manuscript-repository.contract.js';

manuscriptRepositoryContract(
  'InMemoryManuscriptRepository',
  async () => new InMemoryManuscriptRepository(),
);
