#!/usr/bin/env python3
import argparse
import base64
import json
import os
import re
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any

from ngep_license_cli import (
    build_license_payload,
    build_revoke_list,
    generate_keypair,
    issue_license,
    load_license_document,
    show_license,
    verify_license,
)

DEFAULT_PRODUCT_ID = os.getenv("NGEP_LICENSE_PRODUCT_ID", "enterprise-portal")


INDEX_HTML = """<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>NGEP License Web</title>
  <style>
    :root {
      --bg: #f5f7fb;
      --card: #ffffff;
      --line: #e2e8f0;
      --text: #0f172a;
      --sub: #475569;
      --primary: #2563eb;
      --primary-2: #1d4ed8;
      --ok: #15803d;
      --warn: #b45309;
      --err: #b91c1c;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: "PingFang SC", "Microsoft YaHei", "Noto Sans SC", sans-serif;
      color: var(--text);
      background:
        radial-gradient(circle at 10% 0%, #dbeafe 0, transparent 26%),
        radial-gradient(circle at 90% 10%, #d1fae5 0, transparent 30%),
        var(--bg);
    }
    .shell { max-width: 1200px; margin: 28px auto; padding: 0 16px; }
    .header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 16px;
      margin-bottom: 18px;
    }
    .header-left { min-width: 0; }
    .header-right {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-shrink: 0;
    }
    .lang-label {
      font-size: 12px;
      color: var(--sub);
      font-weight: 700;
    }
    .lang-select {
      width: 108px;
      border: 1px solid #cbd5e1;
      border-radius: 10px;
      padding: 6px 10px;
      font-size: 13px;
      background: #fff;
      color: #0f172a;
      font-weight: 600;
    }
    .title {
      font-size: 26px;
      font-weight: 800;
      margin: 0 0 6px;
      letter-spacing: .2px;
    }
    .sub { color: var(--sub); margin: 0; }
    .panel {
      background: var(--card);
      border: 1px solid var(--line);
      border-radius: 18px;
      box-shadow: 0 10px 24px rgba(15, 23, 42, .06);
      overflow: hidden;
    }
    .tabs {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 0;
      border-bottom: 1px solid var(--line);
      background: linear-gradient(90deg, #eef2ff 0%, #f8fafc 100%);
    }
    .tab-btn {
      border: 0;
      border-right: 1px solid var(--line);
      background: transparent;
      padding: 14px 10px;
      cursor: pointer;
      font-weight: 700;
      color: #334155;
    }
    .tab-btn:last-child { border-right: 0; }
    .tab-btn.active {
      color: #fff;
      background: linear-gradient(135deg, var(--primary), var(--primary-2));
    }
    .content { padding: 18px; }
    .tab { display: none; }
    .tab.active { display: block; }
    .grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 12px 14px;
      margin-bottom: 12px;
    }
    .grid.full { grid-template-columns: 1fr; }
    .feature-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 8px;
      border: 1px solid #cbd5e1;
      border-radius: 10px;
      padding: 10px;
      background: #f8fafc;
    }
    .feature-item {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 13px;
      color: #1e293b;
      margin: 0;
      font-weight: 500;
    }
    .feature-item input {
      width: auto;
      margin: 0;
      padding: 0;
    }
    label { display: block; font-size: 12px; color: var(--sub); margin-bottom: 6px; font-weight: 600; }
    input, textarea, select {
      width: 100%;
      border: 1px solid #cbd5e1;
      border-radius: 10px;
      padding: 10px 12px;
      font-size: 14px;
      outline: none;
      background: #fff;
    }
    textarea { min-height: 108px; resize: vertical; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
    input:focus, textarea:focus, select:focus { border-color: var(--primary); box-shadow: 0 0 0 3px rgba(37,99,235,.12); }
    .actions { display: flex; gap: 10px; margin-top: 8px; }
    .btn {
      border: 0;
      border-radius: 10px;
      padding: 10px 16px;
      font-size: 14px;
      font-weight: 700;
      cursor: pointer;
      color: #fff;
      background: linear-gradient(135deg, var(--primary), var(--primary-2));
    }
    .btn.secondary {
      color: #1e293b;
      background: #e2e8f0;
    }
    .hint {
      margin-top: 10px;
      font-size: 12px;
      color: #64748b;
      line-height: 1.5;
    }
    .result-wrap {
      margin-top: 16px;
      border-top: 1px dashed #cbd5e1;
      padding-top: 16px;
    }
    .status {
      display: inline-block;
      padding: 4px 10px;
      border-radius: 999px;
      font-size: 12px;
      font-weight: 700;
      margin-bottom: 8px;
    }
    .ok { background: #dcfce7; color: var(--ok); }
    .warn { background: #fef3c7; color: var(--warn); }
    .err { background: #fee2e2; color: var(--err); }
    pre {
      margin: 0;
      border: 1px solid #dbeafe;
      background: #0b1220;
      color: #e2e8f0;
      border-radius: 12px;
      padding: 12px;
      max-height: 360px;
      overflow: auto;
      font-size: 12px;
      line-height: 1.55;
    }
    @media (max-width: 960px) {
      .header {
        flex-direction: column;
        align-items: stretch;
      }
      .header-right {
        justify-content: flex-end;
      }
      .tabs { grid-template-columns: repeat(2, 1fr); }
      .grid { grid-template-columns: 1fr; }
      .feature-grid { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <div class="shell">
    <div class="header">
      <div class="header-left">
        <h1 id="app_title" class="title">NGEP 离线授权生成器</h1>
        <p id="app_sub" class="sub">本地运行，不依赖外网。签名算法：Ed25519（OpenSSL）。</p>
      </div>
      <div class="header-right">
        <span id="lang_label" class="lang-label">语言</span>
        <select id="lang_select" class="lang-select" aria-label="Language">
          <option value="zh">中文</option>
          <option value="en">English</option>
        </select>
      </div>
    </div>
    <div class="panel">
      <div class="tabs">
        <button id="tab_btn_issue" class="tab-btn active" data-tab="issue">签发授权</button>
        <button id="tab_btn_verify" class="tab-btn" data-tab="verify">验签与展示</button>
        <button id="tab_btn_revoke" class="tab-btn" data-tab="revoke">吊销列表</button>
        <button id="tab_btn_keypair" class="tab-btn" data-tab="keypair">生成密钥</button>
      </div>
      <div class="content">
        <section class="tab active" id="tab-issue">
          <div class="grid">
            <div><label id="lbl_issue_private_key">私钥路径</label><input id="issue_private_key" value="./keys/private_key.pem"></div>
            <div><label id="lbl_issue_license_id">License ID（HYX-XXXXX-XXXXX-XXXXX-XXXXX-XXXXX，留空自动生成）</label><input id="issue_license_id" value=""></div>
            <div><label id="lbl_issue_product_model">产品型号</label><input id="issue_product_model" value="NGEPv3.0-HYX-PS"></div>
            <div><label id="lbl_issue_grant_type">授权类型</label><select id="issue_grant_type"><option id="opt_grant_formal" value="formal">正式授权</option><option id="opt_grant_trial" value="trial">试用授权</option><option id="opt_grant_learning" value="learning">学习授权</option></select></div>
            <div><label id="lbl_issue_customer">客户</label><input id="issue_customer" value="ShiKu Inc."></div>
            <div><label id="lbl_issue_installation_id">安装 ID</label><input id="issue_installation_id" value=""></div>
            <div><label id="lbl_issue_edition">版本</label><input id="issue_edition" value="enterprise"></div>
            <div><label id="lbl_issue_issued_at">签发时间 (ISO8601)</label><input id="issue_issued_at" placeholder="2026-02-27T00:00:00Z"></div>
            <div><label id="lbl_issue_not_before">生效时间 (ISO8601)</label><input id="issue_not_before" placeholder="2026-02-27T00:00:00Z"></div>
            <div><label id="lbl_issue_expires_at">过期时间 (ISO8601)</label><input id="issue_expires_at" value="2027-02-27T23:59:59Z"></div>
            <div><label id="lbl_issue_limits_users">授权人数 limits.users</label><input id="issue_limits_users" type="number" value="500"></div>
            <div><label id="lbl_issue_rev">修订号 rev</label><input id="issue_rev" type="number" value="1"></div>
          </div>
          <div class="grid full">
            <div>
              <label id="lbl_issue_features">功能选择（features）</label>
              <div id="issue_feature_options" class="feature-grid">
                <label class="feature-item"><input id="issue_feature_all" type="checkbox" onchange="toggleAllFeatures(this.checked)"><span id="lbl_issue_feature_all">全部功能</span></label>
                <label class="feature-item"><input type="checkbox" data-feature="1" value="ldap" checked><span id="feat_ldap">LDAP 集成</span></label>
                <label class="feature-item"><input type="checkbox" data-feature="1" value="sso" checked><span id="feat_sso">单点登录 SSO</span></label>
                <label class="feature-item"><input type="checkbox" data-feature="1" value="ai.audit" checked><span id="feat_ai_audit">AI 审计</span></label>
                <label class="feature-item"><input type="checkbox" data-feature="1" value="rbac.advanced"><span id="feat_rbac">高级 RBAC</span></label>
                <label class="feature-item"><input type="checkbox" data-feature="1" value="kb.manage"><span id="feat_kb">知识库管理</span></label>
                <label class="feature-item"><input type="checkbox" data-feature="1" value="log.forwarding"><span id="feat_log_forwarding">日志外发</span></label>
                <label class="feature-item"><input type="checkbox" data-feature="1" value="iam.audit"><span id="feat_iam_audit">IAM 审计模块</span></label>
                <label class="feature-item"><input type="checkbox" data-feature="1" value="session.security"><span id="feat_session_security">会话安全策略</span></label>
              </div>
              <label id="lbl_issue_custom_features" style="margin-top:10px;">自定义功能（每行一个，可选）</label>
              <textarea id="issue_custom_features" placeholder="feature.x&#10;module.y"></textarea>
            </div>
            <div><label id="lbl_issue_extra_limits">额外 limits JSON（对象）</label><textarea id="issue_limits_json">{}</textarea></div>
          </div>
          <div class="actions">
            <button id="btn_issue" class="btn" onclick="issueLicense()">签发 License</button>
            <button id="btn_issue_demo" class="btn secondary" onclick="fillDemoIssue()">填充演示数据</button>
          </div>
          <p id="hint_issue" class="hint">签发成功后将自动下载：客户名称+LicenseID.bin（内容为 JSON 二进制）。</p>
        </section>

        <section class="tab" id="tab-verify">
          <div class="grid">
            <div><label id="lbl_verify_public_key">公钥路径</label><input id="verify_public_key" value="./examples/public_key.pem"></div>
            <div><label id="lbl_verify_with_canonical">输出 canonical payload</label><select id="verify_with_canonical"><option value="true">true</option><option value="false">false</option></select></div>
          </div>
          <div class="grid full">
            <div>
              <label id="lbl_verify_license_upload">上传 License 文件</label>
              <input id="verify_license_upload" type="file" accept=".bin,.json,application/octet-stream,application/json,text/plain" />
              <p id="hint_verify_upload" class="hint">支持 .bin / .json 文件（内容需包含 payload 与 signature）。</p>
            </div>
          </div>
          <div class="actions"><button id="btn_verify_show" class="btn" onclick="verifyAndShowLicense()">验签并展示</button></div>
        </section>

        <section class="tab" id="tab-revoke">
          <div class="grid">
            <div><label id="lbl_revoke_output">输出文件</label><input id="revoke_output" value="./examples/revocation-list.sample.json"></div>
            <div><label id="lbl_revoke_reason">reason</label><input id="revoke_reason" value="manual_revoke"></div>
            <div><label id="lbl_revoke_rev">rev</label><input id="revoke_rev" type="number" value="1"></div>
          </div>
          <div class="grid full">
            <div><label id="lbl_revoke_license_ids">license_ids（每行一个）</label><textarea id="revoke_license_ids">LIC-EP-2026-0001</textarea></div>
            <div><label id="lbl_revoke_license_files">license_files（每行一个，可选）</label><textarea id="revoke_license_files">./examples/license.formal.sample.json</textarea></div>
          </div>
          <div class="actions"><button id="btn_revoke" class="btn" onclick="makeRevokeList()">生成吊销列表</button></div>
        </section>

        <section class="tab" id="tab-keypair">
          <div class="grid">
            <div><label id="lbl_key_private_out">私钥输出路径</label><input id="key_private_out" value="./keys/private_key.pem"></div>
            <div><label id="lbl_key_public_out">公钥输出路径</label><input id="key_public_out" value="./examples/public_key.pem"></div>
          </div>
          <div class="actions"><button id="btn_keypair" class="btn" onclick="genKeypair()">生成密钥对</button></div>
          <p id="hint_keypair" class="hint">私钥仅用于离线授权环境，不要进入产品容器镜像。</p>
        </section>

        <div class="result-wrap">
          <div id="result_status" class="status warn">等待操作</div>
          <pre id="result">{"message":"ready"}</pre>
        </div>
      </div>
    </div>
  </div>

  <script>
    const $ = (id) => document.getElementById(id);
    const I18N = {
      zh: {
        app_title: 'NGEP 离线授权生成器',
        app_sub: '本地运行，不依赖外网。签名算法：Ed25519（OpenSSL）。',
        lang_label: '语言',
        tab_btn_issue: '签发授权',
        tab_btn_verify: '验签与展示',
        tab_btn_revoke: '吊销列表',
        tab_btn_keypair: '生成密钥',
        lbl_issue_private_key: '私钥路径',
        lbl_issue_license_id: 'License ID（HYX-XXXXX-XXXXX-XXXXX-XXXXX-XXXXX，留空自动生成）',
        lbl_issue_product_model: '产品型号',
        lbl_issue_grant_type: '授权类型',
        opt_grant_formal: '正式授权',
        opt_grant_trial: '试用授权',
        opt_grant_learning: '学习授权',
        lbl_issue_customer: '客户',
        lbl_issue_installation_id: '安装 ID',
        lbl_issue_edition: '版本',
        lbl_issue_issued_at: '签发时间 (ISO8601)',
        lbl_issue_not_before: '生效时间 (ISO8601)',
        lbl_issue_expires_at: '过期时间 (ISO8601)',
        lbl_issue_limits_users: '授权人数 limits.users',
        lbl_issue_rev: '修订号 rev',
        lbl_issue_features: '功能选择（features）',
        lbl_issue_feature_all: '全部功能',
        feat_ldap: 'LDAP 集成',
        feat_sso: '单点登录 SSO',
        feat_ai_audit: 'AI 审计',
        feat_rbac: '高级 RBAC',
        feat_kb: '知识库管理',
        feat_log_forwarding: '日志外发',
        feat_iam_audit: 'IAM 审计模块',
        feat_session_security: '会话安全策略',
        lbl_issue_custom_features: '自定义功能（每行一个，可选）',
        lbl_issue_extra_limits: '额外 limits JSON（对象）',
        btn_issue: '签发 License',
        btn_issue_demo: '填充演示数据',
        hint_issue: '签发成功后将自动下载：客户名称+LicenseID.bin（内容为 JSON 二进制）。',
        lbl_verify_public_key: '公钥路径',
        lbl_verify_with_canonical: '输出 canonical payload',
        lbl_verify_license_upload: '上传 License 文件',
        hint_verify_upload: '支持 .bin / .json 文件（内容需包含 payload 与 signature）。',
        btn_verify_show: '验签并展示',
        lbl_revoke_output: '输出文件',
        lbl_revoke_reason: 'reason',
        lbl_revoke_rev: 'rev',
        lbl_revoke_license_ids: 'license_ids（每行一个）',
        lbl_revoke_license_files: 'license_files（每行一个，可选）',
        btn_revoke: '生成吊销列表',
        lbl_key_private_out: '私钥输出路径',
        lbl_key_public_out: '公钥输出路径',
        btn_keypair: '生成密钥对',
        hint_keypair: '私钥仅用于离线授权环境，不要进入产品容器镜像。',
        err_select_license_file: '请先上传 License 文件',
        err_invalid_license_file: 'License 文件格式错误，必须包含 payload 与 signature',
        result_waiting: '等待操作',
        status_ok: '成功',
        status_err: '失败',
        status_warn: '提示',
      },
      en: {
        app_title: 'NGEP License Offline Generator',
        app_sub: 'Runs locally without external network. Signature algorithm: Ed25519 (OpenSSL).',
        lang_label: 'Language',
        tab_btn_issue: 'Issue',
        tab_btn_verify: 'Verify & Show',
        tab_btn_revoke: 'Revoke List',
        tab_btn_keypair: 'Gen Keypair',
        lbl_issue_private_key: 'Private Key Path',
        lbl_issue_license_id: 'License ID (HYX-XXXXX-XXXXX-XXXXX-XXXXX-XXXXX, auto-generate when empty)',
        lbl_issue_product_model: 'Product Model',
        lbl_issue_grant_type: 'Grant Type',
        opt_grant_formal: 'Formal',
        opt_grant_trial: 'Trial',
        opt_grant_learning: 'Learning',
        lbl_issue_customer: 'Customer',
        lbl_issue_installation_id: 'Installation ID',
        lbl_issue_edition: 'Edition',
        lbl_issue_issued_at: 'Issued At (ISO8601)',
        lbl_issue_not_before: 'Not Before (ISO8601)',
        lbl_issue_expires_at: 'Expires At (ISO8601)',
        lbl_issue_limits_users: 'Licensed Users (limits.users)',
        lbl_issue_rev: 'Revision (rev)',
        lbl_issue_features: 'Feature Selection (features)',
        lbl_issue_feature_all: 'All Features',
        feat_ldap: 'LDAP Integration',
        feat_sso: 'Single Sign-On (SSO)',
        feat_ai_audit: 'AI Audit',
        feat_rbac: 'Advanced RBAC',
        feat_kb: 'Knowledge Base Management',
        feat_log_forwarding: 'Log Forwarding',
        feat_iam_audit: 'IAM Audit Module',
        feat_session_security: 'Session Security Policy',
        lbl_issue_custom_features: 'Custom Features (one per line, optional)',
        lbl_issue_extra_limits: 'Extra Limits JSON (object)',
        btn_issue: 'Issue License',
        btn_issue_demo: 'Fill Demo Data',
        hint_issue: 'After issuing, a download starts automatically: Customer+LicenseID.bin (JSON bytes).',
        lbl_verify_public_key: 'Public Key Path',
        lbl_verify_with_canonical: 'Include canonical payload',
        lbl_verify_license_upload: 'Upload License File',
        hint_verify_upload: 'Supports .bin / .json files (must include payload and signature).',
        btn_verify_show: 'Verify and Show',
        lbl_revoke_output: 'Output File',
        lbl_revoke_reason: 'reason',
        lbl_revoke_rev: 'rev',
        lbl_revoke_license_ids: 'license_ids (one per line)',
        lbl_revoke_license_files: 'license_files (one per line, optional)',
        btn_revoke: 'Generate Revoke List',
        lbl_key_private_out: 'Private Key Output Path',
        lbl_key_public_out: 'Public Key Output Path',
        btn_keypair: 'Generate Keypair',
        hint_keypair: 'Private key is for offline issuing environment only, never ship to product image.',
        err_select_license_file: 'Please upload a license file first',
        err_invalid_license_file: 'Invalid license file format: payload/signature are required',
        result_waiting: 'Waiting',
        status_ok: 'Success',
        status_err: 'Failed',
        status_warn: 'Info',
      },
    };
    const LANG_STORAGE_KEY = 'ngep-license-web-lang';
    let currentLang = 'zh';

    function t(key) {
      return (I18N[currentLang] && I18N[currentLang][key]) || (I18N.zh && I18N.zh[key]) || key;
    }

    function applyLanguage(lang) {
      currentLang = lang === 'en' ? 'en' : 'zh';
      document.documentElement.lang = currentLang === 'en' ? 'en' : 'zh-CN';
      Object.keys(I18N.zh).forEach((key) => {
        const el = $(key);
        if (el) el.textContent = t(key);
      });
      const langSelect = $('lang_select');
      if (langSelect && langSelect.value !== currentLang) {
        langSelect.value = currentLang;
      }
      const statusEl = $('result_status');
      if (statusEl && statusEl.classList.contains('warn') && (statusEl.textContent || '').trim()) {
        statusEl.textContent = t('result_waiting');
      }
      try {
        localStorage.setItem(LANG_STORAGE_KEY, currentLang);
      } catch (_) {}
    }

    function detectInitialLang() {
      try {
        const saved = localStorage.getItem(LANG_STORAGE_KEY);
        if (saved === 'zh' || saved === 'en') return saved;
      } catch (_) {}
      const nav = (navigator.language || '').toLowerCase();
      return nav.startsWith('zh') ? 'zh' : 'en';
    }

    const tabButtons = document.querySelectorAll('.tab-btn');
    const tabs = document.querySelectorAll('.tab');
    tabButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        tabButtons.forEach(b => b.classList.remove('active'));
        tabs.forEach(t => t.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
      });
    });

    function setResult(kind, payload) {
      const status = $('result_status');
      status.className = 'status ' + (kind === 'ok' ? 'ok' : kind === 'err' ? 'err' : 'warn');
      status.textContent = kind === 'ok' ? t('status_ok') : kind === 'err' ? t('status_err') : t('status_warn');
      $('result').textContent = JSON.stringify(payload, null, 2);
    }

    async function post(url, data) {
      const res = await fetch(url, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(data),
      });
      const payload = await res.json().catch(() => ({detail: 'Invalid JSON response'}));
      if (!res.ok) throw payload;
      return payload;
    }

    function parseMaybeJson(text) {
      if (!text || !text.trim()) return null;
      return JSON.parse(text);
    }

    function downloadBase64File(base64Text, fileName) {
      const binary = atob(base64Text || '');
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i += 1) {
        bytes[i] = binary.charCodeAt(i);
      }
      const blob = new Blob([bytes], { type: 'application/octet-stream' });
      const href = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = href;
      a.download = fileName || 'license.bin';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(href);
    }

    function getIssueFeatureCheckboxes() {
      return Array.from(document.querySelectorAll('#issue_feature_options input[type="checkbox"][data-feature="1"]'));
    }

    function syncFeatureAllState() {
      const master = $('issue_feature_all');
      if (!master) return;
      const boxes = getIssueFeatureCheckboxes();
      const checkedCount = boxes.filter((input) => input.checked).length;
      master.checked = boxes.length > 0 && checkedCount === boxes.length;
      master.indeterminate = checkedCount > 0 && checkedCount < boxes.length;
    }

    function toggleAllFeatures(checked) {
      getIssueFeatureCheckboxes().forEach((input) => {
        input.checked = !!checked;
      });
      syncFeatureAllState();
    }

    function bindFeatureSelectionEvents() {
      getIssueFeatureCheckboxes().forEach((input) => {
        input.addEventListener('change', () => syncFeatureAllState());
      });
      syncFeatureAllState();
    }

    function setIssueFeatureSelection(list) {
      const selected = new Set(list || []);
      getIssueFeatureCheckboxes().forEach((input) => {
        input.checked = selected.has(input.value);
      });
      syncFeatureAllState();
    }

    function collectIssueFeatures() {
      const features = {};
      document.querySelectorAll('#issue_feature_options input[type="checkbox"][data-feature="1"]:checked').forEach((input) => {
        features[input.value] = true;
      });
      const custom = ($('issue_custom_features').value || '')
        .split('\\n')
        .map((line) => line.trim())
        .filter(Boolean);
      custom.forEach((feature) => {
        features[feature] = true;
      });
      return features;
    }

    function fillDemoIssue() {
      $('issue_installation_id').value = 'e1728c6b-0713-5963-a3c4-63d5e7155616';
      $('issue_license_id').value = 'HYX-ABCDE-FGHIJ-KLMNO-PQRST-UVWXY';
      $('issue_product_model').value = 'NGEPv3.0-HYX-PS';
      $('issue_expires_at').value = '2027-12-31T23:59:59Z';
      setIssueFeatureSelection(['ldap', 'sso', 'ai.audit', 'rbac.advanced']);
      $('issue_custom_features').value = '';
      $('issue_limits_json').value = '{"projects":50}';
    }

    async function issueLicense() {
      try {
        const data = {
          private_key: $('issue_private_key').value.trim(),
          license_id: $('issue_license_id').value.trim() || null,
          product_model: $('issue_product_model').value.trim(),
          grant_type: $('issue_grant_type').value,
          customer: $('issue_customer').value.trim(),
          installation_id: $('issue_installation_id').value.trim(),
          issued_at: $('issue_issued_at').value.trim() || null,
          not_before: $('issue_not_before').value.trim() || null,
          expires_at: $('issue_expires_at').value.trim(),
          edition: $('issue_edition').value.trim(),
          features: collectIssueFeatures(),
          extra_limits: parseMaybeJson($('issue_limits_json').value) || {},
          limits_users: Number($('issue_limits_users').value || 0),
          rev: Number($('issue_rev').value || 1),
        };
        const ret = await post('/api/issue', data);
        if (ret.download_base64) {
          downloadBase64File(ret.download_base64, ret.download_name || 'license.bin');
        }
        setResult('ok', ret);
      } catch (e) {
        setResult('err', e);
      }
    }

    async function readLicenseDocFromUpload(fileInputId) {
      const fileInput = $(fileInputId);
      const file = fileInput && fileInput.files && fileInput.files[0];
      if (!file) {
        throw { detail: t('err_select_license_file') };
      }

      const text = await file.text();
      let doc = null;
      try {
        doc = JSON.parse(text);
      } catch {
        try {
          doc = JSON.parse(atob((text || '').trim()));
        } catch {
          throw { detail: t('err_invalid_license_file') };
        }
      }

      const payload = doc && doc.payload;
      const signature = doc && doc.signature;
      if (!payload || typeof payload !== 'object' || typeof signature !== 'string' || !signature.trim()) {
        throw { detail: t('err_invalid_license_file') };
      }
      return { payload, signature: signature.trim(), fileName: file.name || 'license.bin' };
    }

    async function verifyAndShowLicense() {
      try {
        const parsed = await readLicenseDocFromUpload('verify_license_upload');

        const verifyRet = await post('/api/verify', {
          public_key: $('verify_public_key').value.trim(),
          license_doc: { payload: parsed.payload, signature: parsed.signature },
        });

        const showRet = await post('/api/show', {
          license_doc: { payload: parsed.payload, signature: parsed.signature },
          with_canonical: $('verify_with_canonical').value === 'true',
        });

        setResult(verifyRet.valid ? 'ok' : 'err', {
          file_name: parsed.fileName,
          verify: verifyRet,
          show: showRet,
        });
      } catch (e) {
        setResult('err', e);
      }
    }

    async function makeRevokeList() {
      try {
        const data = {
          output: $('revoke_output').value.trim(),
          reason: $('revoke_reason').value.trim(),
          rev: Number($('revoke_rev').value || 1),
          license_ids: $('revoke_license_ids').value.split('\\n').map(s => s.trim()).filter(Boolean),
          license_files: $('revoke_license_files').value.split('\\n').map(s => s.trim()).filter(Boolean),
        };
        const ret = await post('/api/revoke-list', data);
        setResult('ok', ret);
      } catch (e) {
        setResult('err', e);
      }
    }

    async function genKeypair() {
      try {
        const data = {
          private_key_out: $('key_private_out').value.trim(),
          public_key_out: $('key_public_out').value.trim(),
        };
        const ret = await post('/api/gen-keypair', data);
        setResult('ok', ret);
      } catch (e) {
        setResult('err', e);
      }
    }

    const langSelect = $('lang_select');
    if (langSelect) {
      langSelect.addEventListener('change', (e) => {
        applyLanguage((e.target && e.target.value) || 'zh');
      });
    }
    bindFeatureSelectionEvents();
    applyLanguage(detectInitialLang());
  </script>
</body>
</html>
"""


def _json_error(message: str, status: int = HTTPStatus.BAD_REQUEST) -> tuple[int, dict[str, Any]]:
    return int(status), {"ok": False, "error": message}


def _safe_filename_part(value: str, fallback: str) -> str:
    text = (value or "").strip() or fallback
    text = text.replace("/", "_").replace("\\", "_").replace(":", "_")
    text = re.sub(r"[^0-9A-Za-z\u4e00-\u9fff._-]+", "_", text)
    text = re.sub(r"_+", "_", text).strip("._")
    return text or fallback


def _build_download_payload(license_doc: dict[str, Any]) -> tuple[str, str]:
    payload = license_doc.get("payload") if isinstance(license_doc, dict) else {}
    customer_raw = str((payload or {}).get("customer") or "customer")
    license_id_raw = str((payload or {}).get("license_id") or "license")
    customer = _safe_filename_part(customer_raw, "customer")
    license_id = _safe_filename_part(license_id_raw, "license")
    file_name = f"{customer}+{license_id}.bin"
    # Keep content as JSON bytes so product side can parse directly.
    file_bytes = json.dumps(license_doc, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    return file_name, base64.b64encode(file_bytes).decode("ascii")


class LicenseHandler(BaseHTTPRequestHandler):
    server_version = "NGEPLicenseWeb/1.0"

    def _send_json(self, status: int, data: dict[str, Any]) -> None:
        payload = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def _send_html(self, html: str) -> None:
        payload = html.encode("utf-8")
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def _read_json_body(self) -> dict[str, Any]:
        length = int(self.headers.get("Content-Length", "0"))
        raw = self.rfile.read(length) if length > 0 else b"{}"
        return json.loads(raw.decode("utf-8"))

    def do_GET(self) -> None:
        if self.path in {"/", "/index.html"}:
            self._send_html(INDEX_HTML)
            return
        self._send_json(HTTPStatus.NOT_FOUND, {"ok": False, "error": "Not found"})

    def do_POST(self) -> None:
        try:
            body = self._read_json_body()
        except Exception:
            self._send_json(HTTPStatus.BAD_REQUEST, {"ok": False, "error": "Invalid JSON body"})
            return

        try:
            if self.path == "/api/gen-keypair":
                private_key_out = str(body.get("private_key_out") or "").strip()
                public_key_out = str(body.get("public_key_out") or "").strip()
                if not private_key_out or not public_key_out:
                    status, payload = _json_error("private_key_out and public_key_out are required")
                    self._send_json(status, payload)
                    return
                result = generate_keypair(private_key_out=private_key_out, public_key_out=public_key_out)
                self._send_json(HTTPStatus.OK, {"ok": True, **result})
                return

            if self.path == "/api/issue":
                payload = build_license_payload(
                    license_id=body.get("license_id"),
                    product_id=DEFAULT_PRODUCT_ID,
                    product_model=str(body.get("product_model") or "").strip(),
                    grant_type=str(body.get("grant_type") or "").strip(),
                    customer=str(body.get("customer") or "").strip(),
                    installation_id=str(body.get("installation_id") or "").strip(),
                    issued_at=body.get("issued_at"),
                    not_before=body.get("not_before"),
                    expires_at=str(body.get("expires_at") or "").strip(),
                    edition=str(body.get("edition") or "standard").strip(),
                    features=body.get("features") or {},
                    limits_users=int(body.get("limits_users") or 0),
                    extra_limits=body.get("extra_limits") or {},
                    rev=int(body.get("rev") or 1),
                )
                result = issue_license(
                    private_key=str(body.get("private_key") or "").strip(),
                    payload=payload,
                    output=str(body.get("output") or "").strip() or None,
                )
                download_name, download_base64 = _build_download_payload(result["license_doc"])
                self._send_json(
                    HTTPStatus.OK,
                    {
                        "ok": True,
                        "fingerprint": result["fingerprint"],
                        "output": result["output"],
                        "license_doc": result["license_doc"],
                        "download_name": download_name,
                        "download_base64": download_base64,
                    },
                )
                return

            if self.path == "/api/verify":
                doc = load_license_document(
                    license_file=(str(body.get("license_file")).strip() if body.get("license_file") else None),
                    license_doc=body.get("license_doc"),
                )
                result = verify_license(
                    public_key=str(body.get("public_key") or "").strip(),
                    license_doc=doc,
                )
                self._send_json(HTTPStatus.OK, {"ok": True, **result})
                return

            if self.path == "/api/show":
                doc = load_license_document(
                    license_file=(str(body.get("license_file")).strip() if body.get("license_file") else None),
                    license_doc=body.get("license_doc"),
                )
                result = show_license(license_doc=doc)
                with_canonical = bool(body.get("with_canonical", True))
                response = {
                    "ok": True,
                    "license_doc": result["license_doc"],
                    "fingerprint": result["fingerprint"],
                }
                if with_canonical:
                    response["canonical_payload"] = result["canonical_payload"]
                self._send_json(HTTPStatus.OK, response)
                return

            if self.path == "/api/revoke-list":
                docs: list[dict[str, Any]] = []
                for path in body.get("license_files") or []:
                    if str(path).strip():
                        docs.append(load_license_document(license_file=str(path).strip()))
                revocation = build_revoke_list(
                    product_id=DEFAULT_PRODUCT_ID,
                    rev=int(body.get("rev") or 1),
                    reason=str(body.get("reason") or "manual_revoke"),
                    revoked_at=body.get("revoked_at"),
                    license_ids=[str(i).strip() for i in (body.get("license_ids") or []) if str(i).strip()],
                    license_docs=docs,
                    output=str(body.get("output") or "").strip() or None,
                )
                self._send_json(HTTPStatus.OK, {"ok": True, "revocation_list": revocation, "output": body.get("output")})
                return

            self._send_json(HTTPStatus.NOT_FOUND, {"ok": False, "error": "Unknown API"})
        except Exception as exc:
            self._send_json(HTTPStatus.BAD_REQUEST, {"ok": False, "error": str(exc)})


def run_server(host: str, port: int) -> None:
    server = ThreadingHTTPServer((host, port), LicenseHandler)
    print(f"[ok] NGEP License Web running: http://{host}:{port}")
    print("[hint] Use Ctrl+C to stop.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="NGEP License Web UI server")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8765)
    return parser


def main() -> int:
    args = build_parser().parse_args()
    run_server(args.host, args.port)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
