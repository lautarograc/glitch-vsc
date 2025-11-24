import fetch from 'node-fetch';

export async function checkGlitchTipConnection(url: string, token: string, org: string, project: string) {
    const issuesUrl = `${url}/api/0/projects/${org}/${project}/issues/?query=is:unresolved&limit=1`;

    console.log(`\nTesting Connection to: ${issuesUrl}`);

    try {
        const res = await fetch(issuesUrl, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!res.ok) {
            console.error(`❌ API Error: ${res.status} ${res.statusText}`);
            return false;
        }

        const data = await res.json() as any[];
        console.log(`✅ Success! Found ${data.length} issues.`);
        if (data.length > 0) {
            console.log(`   Sample Issue: [${data[0].shortId}] ${data[0].title}`);
        }
        return true;
    } catch (error) {
        console.error("❌ Network Error:", error);
        return false;
    }
}
