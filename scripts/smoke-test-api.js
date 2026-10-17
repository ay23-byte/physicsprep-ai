const baseUrl = (process.env.API_BASE_URL || "http://localhost:3001").replace(/\/$/, "");

const checks = [
  { name: "Health", path: "/api/health" },
  { name: "Dashboard statistics", path: "/api/dashboard/stats" },
  { name: "Question list", path: "/api/questions" },
  { name: "PDF document list", path: "/api/pdf/documents" },
];

let failed = false;

for (const check of checks) {
  try {
    const response = await fetch(`${baseUrl}${check.path}`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(5000),
    });
    const body = await response.text();

    if (!response.ok) {
      failed = true;
      console.error(`FAIL ${check.name}: HTTP ${response.status} — ${body.slice(0, 200)}`);
      continue;
    }

    try {
      JSON.parse(body);
    } catch {
      failed = true;
      console.error(`FAIL ${check.name}: response was not valid JSON.`);
      continue;
    }

    console.log(`PASS ${check.name}: HTTP ${response.status}`);
  } catch (error) {
    failed = true;
    console.error(`FAIL ${check.name}: ${error.message}`);
  }
}

if (failed) {
  console.error(`\nAPI smoke test failed. Check that the backend is running at ${baseUrl}.`);
  process.exitCode = 1;
} else {
  console.log("\nAll API smoke checks passed. No records were changed.");
}
