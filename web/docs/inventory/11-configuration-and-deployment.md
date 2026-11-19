# Inventory: Configuration and Deployment

**Category**: `11-configuration-and-deployment`  
**File Count**: 13 files  
**Description**: Package manifests, TypeScript config, Next.js configuration, environment templates, and ignore files

---

### [`.env`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/.env)

- **Relative Path**: `.env`
- **File Type**: `file` (25 lines, 809 bytes)
- **Category**: Configuration and Deployment
- **Purpose & Responsibility**: --------------------------
- **Main Exports / Entry Points**: *(None / Default entry point)*
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: *None*
- **Git Status**: Untracked
- **Existing Tests & Coverage**: Indirect coverage via full test suite / integration routes
- **Known Issues & Safety Implications**: Build and environment configuration.
- **Recommended Action**: **`KEEP`**

---

### [`.gitignore`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/.gitignore)

- **Relative Path**: `.gitignore`
- **File Type**: `file` (22 lines, 214 bytes)
- **Category**: Configuration and Deployment
- **Purpose & Responsibility**: Python / Virtual Environment
- **Main Exports / Entry Points**: *(None / Default entry point)*
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: *None*
- **Git Status**: Tracked (Clean)
- **Existing Tests & Coverage**: Indirect coverage via full test suite / integration routes
- **Known Issues & Safety Implications**: Build and environment configuration.
- **Recommended Action**: **`KEEP`**

---

### [`web/.env.example`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/.env.example)

- **Relative Path**: `web/.env.example`
- **File Type**: `.example` (10 lines, 520 bytes)
- **Category**: Configuration and Deployment
- **Purpose & Responsibility**: Copy to .env.local. Server-only: none use the NEXT_PUBLIC_ prefix, so Next.js never sends them to the browser.
- **Main Exports / Entry Points**: *(None / Default entry point)*
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: *None*
- **Git Status**: Tracked (Clean)
- **Existing Tests & Coverage**: Indirect coverage via full test suite / integration routes
- **Known Issues & Safety Implications**: Build and environment configuration.
- **Recommended Action**: **`KEEP`**

---

### [`web/.env.local`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/.env.local)

- **Relative Path**: `web/.env.local`
- **File Type**: `.local` (6 lines, 274 bytes)
- **Category**: Configuration and Deployment
- **Purpose & Responsibility**: Server-only secrets for the web app. Gitignored.
- **Main Exports / Entry Points**: *(None / Default entry point)*
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: *None*
- **Git Status**: Untracked
- **Existing Tests & Coverage**: Indirect coverage via full test suite / integration routes
- **Known Issues & Safety Implications**: Build and environment configuration.
- **Recommended Action**: **`KEEP`**

---

### [`web/.gitignore`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/.gitignore)

- **Relative Path**: `web/.gitignore`
- **File Type**: `file` (47 lines, 590 bytes)
- **Category**: Configuration and Deployment
- **Purpose & Responsibility**: See https://help.github.com/articles/ignoring-files/ for more about ignoring files.
- **Main Exports / Entry Points**: *(None / Default entry point)*
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: *None*
- **Git Status**: Tracked (Modified)
- **Existing Tests & Coverage**: Indirect coverage via full test suite / integration routes
- **Known Issues & Safety Implications**: Build and environment configuration.
- **Recommended Action**: **`KEEP`**

---

### [`web/eslint.config.mjs`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/eslint.config.mjs)

- **Relative Path**: `web/eslint.config.mjs`
- **File Type**: `.mjs` (18 lines, 465 bytes)
- **Category**: Configuration and Deployment
- **Purpose & Responsibility**: Override default ignores of eslint-config-next.
- **Main Exports / Entry Points**: *(None / Default entry point)*
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: `eslint-config-next/core-web-vitals`, `eslint-config-next/typescript`, `eslint/config`
- **Git Status**: Tracked (Clean)
- **Existing Tests & Coverage**: Indirect coverage via full test suite / integration routes
- **Known Issues & Safety Implications**: Build and environment configuration.
- **Recommended Action**: **`KEEP`**

---

### [`web/next-env.d.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/next-env.d.ts)

- **Relative Path**: `web/next-env.d.ts`
- **File Type**: `.ts` (7 lines, 302 bytes)
- **Category**: Configuration and Deployment
- **Purpose & Responsibility**: <reference types="next" />
- **Main Exports / Entry Points**: *(None / Default entry point)*
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: *None*
- **Git Status**: Untracked
- **Existing Tests & Coverage**: Indirect coverage via full test suite / integration routes
- **Known Issues & Safety Implications**: Build and environment configuration.
- **Recommended Action**: **`KEEP`**

---

### [`web/next.config.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/next.config.ts)

- **Relative Path**: `web/next.config.ts`
- **File Type**: `.ts` (10 lines, 318 bytes)
- **Category**: Configuration and Deployment
- **Purpose & Responsibility**: config options here 
- **Main Exports / Entry Points**: *(None / Default entry point)*
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: `next`
- **Git Status**: Tracked (Modified)
- **Existing Tests & Coverage**: Indirect coverage via full test suite / integration routes
- **Known Issues & Safety Implications**: Build and environment configuration.
- **Recommended Action**: **`KEEP`**

---

### [`web/package-lock.json`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/package-lock.json)

- **Relative Path**: `web/package-lock.json`
- **File Type**: `.json` (7199 lines, 251,400 bytes)
- **Category**: Configuration and Deployment
- **Purpose & Responsibility**: Source file for application module
- **Main Exports / Entry Points**: *(None / Default entry point)*
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: *None*
- **Git Status**: Tracked (Clean)
- **Existing Tests & Coverage**: Indirect coverage via full test suite / integration routes
- **Known Issues & Safety Implications**: Build and environment configuration.
- **Recommended Action**: **`KEEP`**

---

### [`web/package.json`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/package.json)

- **Relative Path**: `web/package.json`
- **File Type**: `.json` (39 lines, 1,155 bytes)
- **Category**: Configuration and Deployment
- **Purpose & Responsibility**: Source file for application module
- **Main Exports / Entry Points**: *(None / Default entry point)*
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: *None*
- **Git Status**: Tracked (Modified)
- **Existing Tests & Coverage**: Indirect coverage via full test suite / integration routes
- **Known Issues & Safety Implications**: Build and environment configuration.
- **Recommended Action**: **`KEEP`**

---

### [`web/postcss.config.mjs`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/postcss.config.mjs)

- **Relative Path**: `web/postcss.config.mjs`
- **File Type**: `.mjs` (7 lines, 94 bytes)
- **Category**: Configuration and Deployment
- **Purpose & Responsibility**: Source file for application module
- **Main Exports / Entry Points**: *(None / Default entry point)*
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: *None*
- **Git Status**: Tracked (Clean)
- **Existing Tests & Coverage**: Indirect coverage via full test suite / integration routes
- **Known Issues & Safety Implications**: Build and environment configuration.
- **Recommended Action**: **`KEEP`**

---

### [`web/tsconfig.json`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/tsconfig.json)

- **Relative Path**: `web/tsconfig.json`
- **File Type**: `.json` (45 lines, 830 bytes)
- **Category**: Configuration and Deployment
- **Purpose & Responsibility**: Source file for application module
- **Main Exports / Entry Points**: *(None / Default entry point)*
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: *None*
- **Git Status**: Tracked (Modified)
- **Existing Tests & Coverage**: Indirect coverage via full test suite / integration routes
- **Known Issues & Safety Implications**: Build and environment configuration.
- **Recommended Action**: **`KEEP`**

---

### [`web/tsconfig.tsbuildinfo`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/tsconfig.tsbuildinfo)

- **Relative Path**: `web/tsconfig.tsbuildinfo`
- **File Type**: `.tsbuildinfo` (1 lines, 206,778 bytes)
- **Category**: Configuration and Deployment
- **Purpose & Responsibility**: Source file for application module
- **Main Exports / Entry Points**: *(None / Default entry point)*
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: *None*
- **Git Status**: Untracked
- **Existing Tests & Coverage**: Indirect coverage via full test suite / integration routes
- **Known Issues & Safety Implications**: Build and environment configuration.
- **Recommended Action**: **`KEEP`**

---
