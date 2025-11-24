import * as vscode from 'vscode';
import fetch from 'node-fetch';

interface GlitchTipIssue {
    id: string;
    shortId: string;
    title: string;
    count: string;
    permalink: string;
}

let issueCache: Map<string, Map<number, GlitchTipIssue[]>> = new Map();

function isAppFrame(frame: any): boolean {
    if (!frame || !frame.filename) return false;

    const filename = frame.filename.replace(/\\/g, '/');

    if (filename.match(/^\w+ \([^)]*\)\s/)) return false;

    if (
        filename.includes('gems/') ||
        filename.includes('node_modules') ||
        filename.includes('site-packages')
    ) return false;

    return (
        filename.includes('/app/') ||
        filename.includes('/lib/') ||
        filename.includes('/src/') ||
        filename.startsWith('app/') ||
        filename.startsWith('lib/') ||
        filename.startsWith('src/')
    );
}

function normalizeGlitchTipPath(path: string): string {
    return path.replace(/^\w+ \([^)]*\)\s*/, '').trim();
}

export function activate(context: vscode.ExtensionContext) {
    console.log('GlitchHover is active!');

    const hoverProvider = vscode.languages.registerHoverProvider(
        ['ruby', 'javascript', 'typescript', 'python'],
        {
            provideHover(document, position) {
                const filePath = document.fileName;
                const line = position.line + 1;

                const fileIssues = issueCache.get(filePath);
                if (fileIssues?.has(line)) {
                    return buildHoverContent(fileIssues.get(line)!);
                }
                return null;
            }
        }
    );

    const refreshCommand = vscode.commands.registerCommand('glitchtip.refresh', () => {
        fetchGlitchTipData();
        vscode.window.showInformationMessage('Syncing with GlitchTip...');
    });

    const setupCommand = vscode.commands.registerCommand('glitchtip.setup', async () => {
        const config = vscode.workspace.getConfiguration('glitchtip');

        const url = await vscode.window.showInputBox({
            prompt: 'Enter your GlitchTip URL',
            value: config.get('url') || 'https://app.glitchtip.com',
            ignoreFocusOut: true
        });
        if (!url) return;
        await config.update('url', url, vscode.ConfigurationTarget.Global);

        const org = await vscode.window.showInputBox({
            prompt: 'Enter your Organization Slug',
            placeHolder: 'Found in URL: /settings/ORGANIZATION_SLUG',
            value: config.get('organizationSlug') || '',
            ignoreFocusOut: true
        });
        if (!org) return;
        await config.update('organizationSlug', org, vscode.ConfigurationTarget.Global);

        const project = await vscode.window.showInputBox({
            prompt: 'Enter your Project Slug',
            placeHolder: 'Found in URL: /projects/PROJECT_SLUG',
            value: config.get('projectSlug') || '',
            ignoreFocusOut: true
        });
        if (!project) return;
        await config.update('projectSlug', project, vscode.ConfigurationTarget.Global);

        const token = await vscode.window.showInputBox({
            prompt: 'Enter your API Auth Token',
            placeHolder: 'Create under Profile → Auth Tokens',
            password: true,
            ignoreFocusOut: true
        });
        if (!token) return;
        await config.update('authToken', token, vscode.ConfigurationTarget.Global);

        vscode.window.showInformationMessage('GlitchTip linked successfully! Fetching issues...');
        fetchGlitchTipData();
    });

    context.subscriptions.push(hoverProvider, refreshCommand, setupCommand);

    fetchGlitchTipData();
    setInterval(fetchGlitchTipData, 3600000);
}

function buildHoverContent(issues: GlitchTipIssue[]): vscode.Hover {
    const markdown = new vscode.MarkdownString();
    markdown.isTrusted = true;

    markdown.appendMarkdown(`### 🐞 GlitchTip: ${issues.length} Issue(s) Here\n`);

    issues.forEach(issue => {
        markdown.appendMarkdown(`\n**[${issue.shortId}] ${issue.title}**\n`);
        markdown.appendMarkdown(`Events: ${issue.count} | [Open](${issue.permalink})\n`);
        markdown.appendMarkdown(`---\n`);
    });

    return new vscode.Hover(markdown);
}

async function fetchGlitchTipData() {
    const config = vscode.workspace.getConfiguration('glitchtip');
    const baseUrl = config.get<string>('url');
    const token = config.get<string>('authToken');
    const org = config.get<string>('organizationSlug');
    const project = config.get<string>('projectSlug');

    if (!baseUrl || !token || !org || !project) {
        console.log('GlitchTip config incomplete.');
        return;
    }

    try {

        const limit = 100; // a higher limit may cause slow init times and maybe ratelimiting

        const issuesUrl = `${baseUrl}/api/0/projects/${org}/${project}/issues/?query=is:unresolved&limit=${limit}`;

        const issuesRes = await fetch(issuesUrl, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        if (!issuesRes.ok) {
            console.error(`API Error: ${issuesRes.status} ${issuesRes.statusText}`);
            console.error((await issuesRes.text()).substring(0, 200));
            return;
        }

        const responseText = await issuesRes.text();
        let issues: any[];

        try {
            issues = JSON.parse(responseText);
        } catch {
            console.error("Received non-JSON response:", responseText.substring(0, 200));
            return;
        }

        const newCache = new Map<string, Map<number, GlitchTipIssue[]>>();

        for (const rawIssue of issues) {
            const latestEventUrl = `${baseUrl}/api/0/issues/${rawIssue.id}/events/latest/`;

            const eventRes = await fetch(latestEventUrl, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (!eventRes.ok) continue;

            const eventText = await eventRes.text();
            let eventData;
            try {
                eventData = JSON.parse(eventText);
            } catch {
                continue;
            }

            const stacktrace =
                eventData.entries?.find((e: any) => e.type === 'exception')?.data?.values?.[0]?.stacktrace;

            if (!stacktrace?.frames) continue;

            const appFrames = stacktrace.frames
                .map((f: any) => ({ ...f, filename: normalizeGlitchTipPath(f.filename) }))
                .filter(isAppFrame);

            if (appFrames.length === 0) continue;

            const rootFrame = appFrames[appFrames.length - 1];

            const localPath = await findLocalFile(rootFrame.filename);

            if (localPath) {
                const line = rootFrame.lineNo;

                if (!newCache.has(localPath)) {
                    newCache.set(localPath, new Map());
                }

                const fileMap = newCache.get(localPath)!;
                if (!fileMap.has(line)) {
                    fileMap.set(line, []);
                }

                const list = fileMap.get(line)!;
                console.log(`Mapping issue ${rawIssue.shortId} to ${localPath}:${line}`);
                console.log(`rawIssue: ${JSON.stringify(rawIssue)}`);
                if (!list.find(i => i.id === rawIssue.id)) {
                    list.push({
                        id: rawIssue.id,
                        shortId: rawIssue.shortId,
                        title: rawIssue.title,
                        count: rawIssue.count,
                        permalink: rawIssue.permalink
                    });
                }
            }
        }

        issueCache = newCache;
        console.log(`GlitchTip: Synced ${issues.length} issues.`);
    } catch (e) {
        console.error("GlitchTip Sync Failed:", e);
    }
}

async function findLocalFile(glitchTipPath: string): Promise<string | null> {
    if (!glitchTipPath) return null;

    const pattern = `**/${glitchTipPath}`;
    const foundFiles = await vscode.workspace.findFiles(pattern, '**/node_modules/**', 1);

    console.log(`Searching for ${glitchTipPath}, found: ${foundFiles.map(f => f.fsPath).join(', ')}`);

    return foundFiles.length > 0 ? foundFiles[0].fsPath : null;
}

export function deactivate() { }
