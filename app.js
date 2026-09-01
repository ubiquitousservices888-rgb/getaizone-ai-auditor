(() => {
  'use strict';

  const TOOL_CATEGORIES = {
    'AI assistants': ['chatgpt','claude','gemini','perplexity','grok','copilot'],
    'Automation platforms': ['zapier','make.com','make ','n8n','pipedream','power automate'],
    'CRM platforms': ['hubspot','salesforce','pipedrive','zoho crm'],
    'Meeting assistants': ['otter','fireflies','fathom','granola'],
    'Design tools': ['canva','figma','adobe express'],
    'AI coding tools': ['cursor','windsurf','github copilot','codeium','replit']
  };

  const SIZE_SPEND_THRESHOLDS = {
    '1-10': 3000,
    '11-50': 10000,
    '51-200': 30000,
    '201-1000': 100000,
    '1000+': 250000
  };

  const form = document.getElementById('auditForm');
  const resultsSection = document.getElementById('results');
  const formError = document.getElementById('formError');
  let lastReport = null;

  const clamp = (value, min = 0, max = 100) => Math.min(max, Math.max(min, Math.round(value)));
  const money = value => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);
  const val = id => document.getElementById(id).value;

  function parseTools(raw) {
    return [...new Set(raw.split(/[\n,;]+/).map(v => v.trim()).filter(Boolean))];
  }

  function detectOverlaps(tools) {
    const lowered = tools.map(t => t.toLowerCase());
    const overlaps = [];
    Object.entries(TOOL_CATEGORIES).forEach(([category, keywords]) => {
      const matches = tools.filter((tool, index) => keywords.some(k => lowered[index].includes(k)));
      if (matches.length >= 2) overlaps.push({ category, tools: matches });
    });
    return overlaps;
  }

  function addFinding(findings, severity, title, why, action) {
    findings.push({ severity, title, why, action });
  }

  function scoreAudit(data) {
    const findings = [];
    const overlaps = detectOverlaps(data.tools);
    const threshold = SIZE_SPEND_THRESHOLDS[data.companySize] || 10000;
    const spendAboveHeuristic = data.monthlySpend > threshold;

    let cost = 100;
    if (overlaps.length) {
      cost -= Math.min(28, overlaps.length * 8);
      overlaps.forEach(overlap => addFinding(
        findings,
        'medium',
        `${overlap.category} overlap detected`,
        `You listed multiple tools in the same broad category: ${overlap.tools.join(', ')}. This does not prove redundancy, but it creates a reasonable consolidation review target.`,
        'Compare actual usage, unique features, seat counts, and renewal dates before consolidating. Keep only tools with a distinct business purpose.'
      ));
    }
    if (data.tools.length > 15) {
      cost -= 16;
      addFinding(findings, 'medium', 'Large tool footprint', `You listed ${data.tools.length} tools. Larger stacks tend to create more duplicate licensing, admin overhead, and policy surface area.`, 'Create a quarterly application inventory with owner, purpose, seats, cost, and renewal date for each tool.');
    } else if (data.tools.length > 9) {
      cost -= 9;
      addFinding(findings, 'low', 'Tool sprawl review recommended', `You listed ${data.tools.length} tools, enough to justify a structured overlap and utilization review.`, 'Identify unused seats, low-adoption subscriptions, and products with overlapping core functions.');
    }
    if (spendAboveHeuristic) {
      cost -= 12;
      addFinding(findings, 'medium', 'Spend level deserves a utilization review', `The entered monthly spend of ${money(data.monthlySpend)} is above GetAIZone's internal review threshold for the selected company-size band. The threshold is a heuristic, not an industry benchmark.`, 'Validate active users, contract minimums, renewal dates, and business-critical use before changing subscriptions.');
    }
    if (data.monthlySpend === 0) cost = Math.min(cost, 90);
    cost = clamp(cost);

    let securityRisk = 5;
    if (data.sensitiveData === 'yes') {
      securityRisk += 22;
      addFinding(findings, 'medium', 'Sensitive data enters AI/SaaS tools', 'You reported that sensitive or regulated data is processed by AI/SaaS tools. This increases the consequence of weak access, retention, or vendor controls.', 'Map which vendors receive sensitive data and verify contractual, retention, access-control, and regulatory requirements for each.');
    }
    if (data.sharedSecrets === 'yes') {
      securityRisk += 35;
      addFinding(findings, 'high', 'Shared credentials or API secrets reported', 'Shared credentials reduce accountability and make safe rotation and revocation harder.', 'Stop sharing passwords and API keys. Move secrets into managed secret storage, use individual identities where possible, and rotate credentials that have been broadly shared.');
    }
    if (data.mfa === 'no') {
      securityRisk += 20;
      addFinding(findings, 'high', 'MFA is not consistently required', 'Core AI and SaaS accounts without MFA are more exposed to credential theft and account takeover.', 'Require MFA for administrators and high-value accounts first, then expand to the full workforce.');
    }
    if (data.freeInstall === 'yes') {
      securityRisk += 14;
      addFinding(findings, 'medium', 'Uncontrolled AI tool adoption', 'Employees can add AI tools without approval, creating shadow-AI risk and reducing visibility into data handling and cost.', 'Create a lightweight approved-tool process with an exception route so employees can still move quickly without bypassing oversight.');
    }
    if (data.vendorReview === 'no') {
      securityRisk += 11;
      addFinding(findings, 'medium', 'Vendor review is informal or absent', 'Without even a lightweight review, teams can adopt tools without checking data handling, security posture, or contractual fit.', 'Use a short vendor checklist covering data types, retention, subprocessors, access controls, security documentation, and owner approval.');
    }
    if (data.approvalControls === 'no' && data.sensitiveData === 'yes') {
      securityRisk += 10;
      addFinding(findings, 'high', 'Sensitive workflows lack action approval controls', 'Sensitive-data use combined with undefined approval for high-impact AI actions increases execution and accountability risk.', 'Require human approval for high-impact actions such as external publishing, financial changes, destructive operations, privileged access, and regulated-data decisions.');
    }
    securityRisk = clamp(securityRisk);

    let governance = 100;
    if (data.governanceOwner === 'no') {
      governance -= 25;
      addFinding(findings, 'medium', 'No clear AI governance owner', 'You reported no assigned owner for AI governance. Without accountable ownership, policies and exceptions tend to drift.', 'Assign a named owner or small cross-functional group responsible for AI inventory, policy, exceptions, and review cadence.');
    }
    if (data.dataPolicy === 'no') {
      governance -= 28;
      addFinding(findings, 'high', 'No written AI/data-use policy', 'Users lack a shared definition of acceptable AI use, prohibited data, and required review.', 'Publish a short practical policy covering approved tools, prohibited data, human review, credential handling, and incident escalation.');
    } else if (data.dataPolicy === 'partial') {
      governance -= 12;
      addFinding(findings, 'low', 'AI policy is incomplete', 'A partial or draft policy is better than none, but it may leave employees uncertain about edge cases and accountability.', 'Finish the policy and add named owners, exception handling, review cadence, and concrete examples.');
    }
    if (data.vendorReview === 'no') governance -= 17;
    if (data.freeInstall === 'yes') governance -= 13;
    if (data.approvalControls === 'no') governance -= 17;
    if (data.sharedSecrets === 'yes') governance -= 10;
    governance = clamp(governance);

    const automationBase = { manual: 82, basic: 66, integrated: 43, advanced: 22 }[data.automationLevel] || 60;
    let automationOpportunity = automationBase;
    if (data.tools.length > 9) automationOpportunity += 5;
    if (overlaps.length) automationOpportunity += Math.min(8, overlaps.length * 3);
    if (spendAboveHeuristic) automationOpportunity += 4;
    automationOpportunity = clamp(automationOpportunity);

    if (data.automationLevel === 'manual') {
      addFinding(findings, 'medium', 'High automation opportunity', 'You described the environment as mostly manual. Repetitive handoffs, data entry, reporting, and routing may be candidates for automation.', 'List the five highest-frequency repetitive workflows and score each by time spent, error rate, business impact, and integration difficulty. Automate the highest-value low-risk candidate first.');
    } else if (data.automationLevel === 'basic') {
      addFinding(findings, 'low', 'Automation is still fragmented', 'A few simple automations often leave cross-system handoffs and exception handling manual.', 'Map workflows end-to-end and look for repeated transfers between email, spreadsheets, CRM, ticketing, and AI tools.');
    }

    if (!findings.some(f => f.severity === 'high' || f.severity === 'medium')) {
      addFinding(findings, 'low', 'No major rule-triggered issue detected', 'Based on the answers provided, the current rule set did not identify a major cost, security, or governance warning.', 'Keep an accurate tool inventory and rerun the audit after major vendor, policy, or workflow changes.');
    }

    const automationMaturityHealth = clamp(100 - automationOpportunity);
    const securityHealth = clamp(100 - securityRisk);
    const overall = clamp((cost + securityHealth + governance + automationMaturityHealth) / 4);

    const savings = estimateSavings(data.monthlySpend, overlaps.length, data.tools.length, spendAboveHeuristic);
    const sortedFindings = findings.sort((a, b) => ({ high: 0, medium: 1, low: 2 }[a.severity] - ({ high: 0, medium: 1, low: 2 }[b.severity]));

    return { cost, securityRisk, automationOpportunity, governance, overall, savings, findings: sortedFindings, overlaps };
  }

  function estimateSavings(monthlySpend, overlapCount, toolCount, spendAboveHeuristic) {
    if (!monthlySpend || monthlySpend <= 0) return { low: 0, high: 0, lowRate: 0, highRate: 0 };
    let lowRate = .02;
    let highRate = .05;
    lowRate += Math.min(.12, overlapCount * .025);
    highRate += Math.min(.20, overlapCount * .05);
    if (toolCount > 9) { lowRate += .02; highRate += .04; }
    if (toolCount > 15) { lowRate += .02; highRate += .04; }
    if (spendAboveHeuristic) { lowRate += .02; highRate += .04; }
    lowRate = Math.min(.25, lowRate);
    highRate = Math.min(.40, Math.max(highRate, lowRate + .03));
    return { low: Math.round(monthlySpend * lowRate), high: Math.round(monthlySpend * highRate), lowRate, highRate };
  }

  function collectData() {
    return {
      companySize: val('companySize'),
      industry: val('industry'),
      monthlySpend: Number(val('monthlySpend')),
      automationLevel: val('automationLevel'),
      tools: parseTools(val('tools')),
      sensitiveData: val('sensitiveData'),
      freeInstall: val('freeInstall'),
      sharedSecrets: val('sharedSecrets'),
      mfa: val('mfa'),
      vendorReview: val('vendorReview'),
      approvalControls: val('approvalControls'),
      governanceOwner: val('governanceOwner'),
      dataPolicy: val('dataPolicy')
    };
  }

  function validate(data) {
    if (!data.companySize || !data.industry || !Number.isFinite(data.monthlySpend) || data.monthlySpend < 0 || !data.automationLevel || data.tools.length === 0) {
      return 'Complete the company size, industry, monthly spend, automation maturity, and tool list before calculating the audit.';
    }
    return '';
  }

  function render(data, report) {
    document.getElementById('overallScore').textContent = report.overall;
    document.getElementById('costScore').textContent = report.cost;
    document.getElementById('securityScore').textContent = report.securityRisk;
    document.getElementById('automationScore').textContent = report.automationOpportunity;
    document.getElementById('governanceScore').textContent = report.governance;
    document.getElementById('costBar').style.width = `${report.cost}%`;
    document.getElementById('securityBar').style.width = `${report.securityRisk}%`;
    document.getElementById('automationBar').style.width = `${report.automationOpportunity}%`;
    document.getElementById('governanceBar').style.width = `${report.governance}%`;

    const highCount = report.findings.filter(f => f.severity === 'high').length;
    const mediumCount = report.findings.filter(f => f.severity === 'medium').length;
    document.getElementById('resultSummary').textContent = `${data.industry} · ${data.companySize} employees · ${data.tools.length} tools reviewed · ${highCount} high-priority and ${mediumCount} medium-priority rule triggers.`;
    document.getElementById('findingCount').textContent = `${report.findings.length} finding${report.findings.length === 1 ? '' : 's'}`;

    const list = document.getElementById('findingsList');
    list.innerHTML = '';
    report.findings.forEach(finding => {
      const row = document.createElement('article');
      row.className = 'finding';
      row.innerHTML = `<span class="severity ${finding.severity}">${escapeHtml(finding.severity)}</span><div><h4>${escapeHtml(finding.title)}</h4><p>${escapeHtml(finding.why)}</p><p class="action"><strong>Recommended action:</strong> ${escapeHtml(finding.action)}</p></div>`;
      list.appendChild(row);
    });

    document.getElementById('savingsRange').textContent = `${money(report.savings.low)}–${money(report.savings.high)} / month`;
    document.getElementById('savingsExplanation').textContent = report.savings.high > 0
      ? `The current rules estimate a review range of ${(report.savings.lowRate * 100).toFixed(0)}%–${(report.savings.highRate * 100).toFixed(0)}% of the ${money(data.monthlySpend)} monthly spend you entered. Actual savings could be lower, higher, or zero after validating contracts and usage.`
      : 'No savings range is calculated when monthly spend is entered as zero.';

    resultsSection.hidden = false;
    resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function escapeHtml(text) {
    return String(text).replace(/[&<>'"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[ch]));
  }

  function reportText(data, report) {
    const lines = [
      'GetAIZone AI Spend & Risk Audit',
      '================================',
      `Industry: ${data.industry}`,
      `Company size: ${data.companySize}`,
      `Monthly AI/software spend entered: ${money(data.monthlySpend)}`,
      `Tools listed (${data.tools.length}): ${data.tools.join(', ')}`,
      '',
      `Overall operations health: ${report.overall}/100`,
      `Cost efficiency: ${report.cost}/100 (higher is better)`,
      `Security risk: ${report.securityRisk}/100 (lower is better)`,
      `Automation opportunity: ${report.automationOpportunity}/100 (higher means more opportunity)`,
      `Governance readiness: ${report.governance}/100 (higher is better)`,
      '',
      `Estimated consolidation planning range: ${money(report.savings.low)}–${money(report.savings.high)} per month`,
      'This range is derived from user-entered spend and disclosed heuristics. It is not guaranteed savings.',
      '',
      'Prioritized findings:'
    ];
    report.findings.forEach((f, i) => {
      lines.push(`${i + 1}. [${f.severity.toUpperCase()}] ${f.title}`);
      lines.push(`   Why: ${f.why}`);
      lines.push(`   Action: ${f.action}`);
    });
    lines.push('', 'Privacy note: GetAIZone does not require passwords, API keys, tokens, or confidential datasets for this audit.', 'Disclaimer: This is an assessment tool, not legal, cybersecurity, financial, or compliance advice.');
    return lines.join('\n');
  }

  form.addEventListener('submit', event => {
    event.preventDefault();
    const data = collectData();
    const error = validate(data);
    if (error) {
      formError.textContent = error;
      formError.hidden = false;
      return;
    }
    formError.hidden = true;
    const report = scoreAudit(data);
    lastReport = { data, report };
    render(data, report);
  });

  document.getElementById('copyReport').addEventListener('click', async () => {
    if (!lastReport) return;
    const text = reportText(lastReport.data, lastReport.report);
    try {
      await navigator.clipboard.writeText(text);
      document.getElementById('copyReport').textContent = 'Copied';
      setTimeout(() => document.getElementById('copyReport').textContent = 'Copy summary', 1600);
    } catch {
      window.prompt('Copy your audit summary:', text);
    }
  });

  document.getElementById('downloadReport').addEventListener('click', () => {
    if (!lastReport) return;
    const blob = new Blob([reportText(lastReport.data, lastReport.report)], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `getaizone-audit-${new Date().toISOString().slice(0, 10)}.txt`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  });

  document.getElementById('prepareInquiry').addEventListener('click', async () => {
    if (!lastReport) return;
    const email = val('leadEmail').trim();
    const status = document.getElementById('leadStatus');
    if (email && !/^\S+@\S+\.\S+$/.test(email)) {
      status.textContent = 'Enter a valid email address or leave the field blank.';
      return;
    }
    const inquiry = `GetAIZone detailed review inquiry\nContact email: ${email || '[add your email]'}\n\n${reportText(lastReport.data, lastReport.report)}`;
    try {
      await navigator.clipboard.writeText(inquiry);
      status.textContent = 'Inquiry copied. This MVP does not transmit your email or audit anywhere automatically.';
    } catch {
      status.textContent = 'Your browser blocked clipboard access. Use Download report instead.';
    }
  });
})();
