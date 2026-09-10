import { cleanupTestData } from "../scripts/cleanup-test-data";

export default async function globalSetup() {
  await cleanupTestData();
}