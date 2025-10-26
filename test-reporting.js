// Test script to verify reporting functionality
const API_BASE_URL = "http://localhost:8000";

async function testReporting() {
  console.log("🧪 Testing Reporting Functionality...\n");
  
  try {
    // 1. Get list of users
    console.log("1. Fetching users...");
    const usersResponse = await fetch(`${API_BASE_URL}/api/users`);
    const users = await usersResponse.json();
    console.log(`   Found ${users.length} users`);
    
    if (users.length < 2) {
      console.log("❌ Need at least 2 users to test reporting");
      return;
    }
    
    // 2. Create a test report (Alice reporting Ben)
    const alice = users.find(u => u.email === "alice@example.com");
    const ben = users.find(u => u.email === "ben@example.com");
    
    if (!alice || !ben) {
      console.log("❌ Could not find Alice or Ben in users");
      return;
    }
    
    console.log(`2. Creating report: Alice (${alice.id}) reporting Ben (${ben.id})`);
    const reportResponse = await fetch(`${API_BASE_URL}/api/reports`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        reason: "Test report from script",
        reporterId: alice.id,
        reportedId: ben.id,
      }),
    });
    
    if (!reportResponse.ok) {
      const error = await reportResponse.json();
      console.log(`❌ Failed to create report: ${error.error}`);
      return;
    }
    
    const report = await reportResponse.json();
    console.log(`   ✅ Report created with ID: ${report.id}`);
    
    // 3. Fetch all reports to verify
    console.log("3. Fetching all reports...");
    const reportsResponse = await fetch(`${API_BASE_URL}/api/reports`);
    const reports = await reportsResponse.json();
    console.log(`   Found ${reports.length} reports`);
    
    const testReport = reports.find(r => r.id === report.id);
    if (testReport) {
      console.log(`   ✅ Test report found:`);
      console.log(`      Reporter: ${testReport.reporter.name} (${testReport.reporter.id})`);
      console.log(`      Reported: ${testReport.reported.name} (${testReport.reported.id})`);
      console.log(`      Reason: ${testReport.reason}`);
    }
    
    console.log("\n🎉 Reporting functionality is working correctly!");
    
  } catch (error) {
    console.log(`❌ Test failed: ${error.message}`);
  }
}

// Run the test
testReporting();