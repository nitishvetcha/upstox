# Inventory: Legacy Python Root Codebase

**Category**: `14-legacy-python-root`  
**File Count**: 74 files  
**Description**: Legacy 2025 Python modules for options scraping, TradingView integration, and sentiment analysis

---

### [`analyzer/__init__.py`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/analyzer/__init__.py)

- **Relative Path**: `analyzer/__init__.py`
- **File Type**: `.py` (0 lines, 0 bytes)
- **Category**: Legacy Python Root Codebase
- **Purpose & Responsibility**: Source file for application module
- **Main Exports / Entry Points**: *(None / Default entry point)*
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: *None*
- **Git Status**: Tracked (Clean)
- **Existing Tests & Coverage**: Indirect coverage via full test suite / integration routes
- **Known Issues & Safety Implications**: Legacy 2025 Python scripts; not part of active Next.js architecture. Retain read-only for historical reference.
- **Recommended Action**: **`DEPRECATE`**

---

### [`analyzer/option_recommender.py`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/analyzer/option_recommender.py)

- **Relative Path**: `analyzer/option_recommender.py`
- **File Type**: `.py` (179 lines, 9,686 bytes)
- **Category**: Legacy Python Root Codebase
- **Purpose & Responsibility**: Set up logging
- **Main Exports / Entry Points**: `calculate_trade_params`, `generate_recommendations`
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: `logging`, `numpy`, `pandas`
- **Git Status**: Tracked (Clean)
- **Existing Tests & Coverage**: Indirect coverage via full test suite / integration routes
- **Known Issues & Safety Implications**: Legacy 2025 Python scripts; not part of active Next.js architecture. Retain read-only for historical reference.
- **Recommended Action**: **`DEPRECATE`**

---

### [`auth/upstox_auth.py`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/auth/upstox_auth.py)

- **Relative Path**: `auth/upstox_auth.py`
- **File Type**: `.py` (69 lines, 2,232 bytes)
- **Category**: Legacy Python Root Codebase
- **Purpose & Responsibility**: auth/upstox_auth.py
- **Main Exports / Entry Points**: `login_upstox`
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: `config.config`, `requests`, `webbrowser`
- **Git Status**: Tracked (Clean)
- **Existing Tests & Coverage**: Indirect coverage via full test suite / integration routes
- **Known Issues & Safety Implications**: Legacy 2025 Python scripts; not part of active Next.js architecture. Retain read-only for historical reference.
- **Recommended Action**: **`DEPRECATE`**

---

### [`config/config.py`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/config/config.py)

- **Relative Path**: `config/config.py`
- **File Type**: `.py` (30 lines, 740 bytes)
- **Category**: Legacy Python Root Codebase
- **Purpose & Responsibility**: config/config.py
- **Main Exports / Entry Points**: *(None / Default entry point)*
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: `dotenv`, `os`
- **Git Status**: Tracked (Clean)
- **Existing Tests & Coverage**: Indirect coverage via full test suite / integration routes
- **Known Issues & Safety Implications**: Legacy 2025 Python scripts; not part of active Next.js architecture. Retain read-only for historical reference.
- **Recommended Action**: **`DEPRECATE`**

---

### [`fetch_options.py`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/fetch_options.py)

- **Relative Path**: `fetch_options.py`
- **File Type**: `.py` (219 lines, 8,649 bytes)
- **Category**: Legacy Python Root Codebase
- **Purpose & Responsibility**: Set up logging
- **Main Exports / Entry Points**: `login_and_get_access_token`, `get_nearest_expiry`, `fetch_spot_price`, `fetch_option_chain`, `filter_strikes_near_spot`, `main`
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: `datetime`, `dotenv`, `logging`, `os`, `pandas` *(+2 more)*
- **Git Status**: Tracked (Clean)
- **Existing Tests & Coverage**: Indirect coverage via full test suite / integration routes
- **Known Issues & Safety Implications**: Legacy 2025 Python scripts; not part of active Next.js architecture. Retain read-only for historical reference.
- **Recommended Action**: **`DEPRECATE`**

---

### [`main.py`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/main.py)

- **Relative Path**: `main.py`
- **File Type**: `.py` (97 lines, 3,866 bytes)
- **Category**: Legacy Python Root Codebase
- **Purpose & Responsibility**: Set up logging
- **Main Exports / Entry Points**: `place_paper_trade`, `main`
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: `analyzer.option_recommender`, `logging`, `pandas`, `sentiment_analysis.news_fetcher`, `sentiment_analysis.twitter_fetcher` *(+4 more)*
- **Git Status**: Tracked (Clean)
- **Existing Tests & Coverage**: Indirect coverage via full test suite / integration routes
- **Known Issues & Safety Implications**: Legacy 2025 Python scripts; not part of active Next.js architecture. Retain read-only for historical reference.
- **Recommended Action**: **`DEPRECATE`**

---

### [`option_chain_cache.pkl`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/option_chain_cache.pkl)

- **Relative Path**: `option_chain_cache.pkl`
- **File Type**: `.pkl` (210 lines, 9,365 bytes)
- **Category**: Legacy Python Root Codebase
- **Purpose & Responsibility**: Source file for application module
- **Main Exports / Entry Points**: *(None / Default entry point)*
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: *None*
- **Git Status**: Untracked
- **Existing Tests & Coverage**: Indirect coverage via full test suite / integration routes
- **Known Issues & Safety Implications**: Legacy 2025 Python scripts; not part of active Next.js architecture. Retain read-only for historical reference.
- **Recommended Action**: **`DEPRECATE`**

---

### [`option_chain_fetcher.log`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/option_chain_fetcher.log)

- **Relative Path**: `option_chain_fetcher.log`
- **File Type**: `.log` (443 lines, 35,344 bytes)
- **Category**: Legacy Python Root Codebase
- **Purpose & Responsibility**: Source file for application module
- **Main Exports / Entry Points**: *(None / Default entry point)*
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: *None*
- **Git Status**: Untracked
- **Existing Tests & Coverage**: Indirect coverage via full test suite / integration routes
- **Known Issues & Safety Implications**: Legacy 2025 Python scripts; not part of active Next.js architecture. Retain read-only for historical reference.
- **Recommended Action**: **`DEPRECATE`**

---

### [`sentiment_analysis/news_fetcher.py`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/sentiment_analysis/news_fetcher.py)

- **Relative Path**: `sentiment_analysis/news_fetcher.py`
- **File Type**: `.py` (52 lines, 1,745 bytes)
- **Category**: Legacy Python Root Codebase
- **Purpose & Responsibility**: sentiment_analysis/news_fetcher.py
- **Main Exports / Entry Points**: `fetch_news_sentiment`
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: `config.config`, `requests`
- **Git Status**: Tracked (Clean)
- **Existing Tests & Coverage**: Indirect coverage via full test suite / integration routes
- **Known Issues & Safety Implications**: Legacy 2025 Python scripts; not part of active Next.js architecture. Retain read-only for historical reference.
- **Recommended Action**: **`DEPRECATE`**

---

### [`sentiment_analysis/sentiment_combiner.py`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/sentiment_analysis/sentiment_combiner.py)

- **Relative Path**: `sentiment_analysis/sentiment_combiner.py`
- **File Type**: `.py` (67 lines, 1,684 bytes)
- **Category**: Legacy Python Root Codebase
- **Purpose & Responsibility**: sentiment_analyzer.py
- **Main Exports / Entry Points**: `analyze_sentiment`, `overall_sentiment`
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: `textblob`
- **Git Status**: Tracked (Clean)
- **Existing Tests & Coverage**: Indirect coverage via full test suite / integration routes
- **Known Issues & Safety Implications**: Legacy 2025 Python scripts; not part of active Next.js architecture. Retain read-only for historical reference.
- **Recommended Action**: **`DEPRECATE`**

---

### [`sentiment_analysis/twitter_fetcher.py`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/sentiment_analysis/twitter_fetcher.py)

- **Relative Path**: `sentiment_analysis/twitter_fetcher.py`
- **File Type**: `.py` (56 lines, 1,949 bytes)
- **Category**: Legacy Python Root Codebase
- **Purpose & Responsibility**: Set up logging
- **Main Exports / Entry Points**: `load_cache`, `save_cache`, `fetch_twitter_sentiment`
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: `datetime`, `logging`, `os`, `pickle`
- **Git Status**: Tracked (Clean)
- **Existing Tests & Coverage**: Indirect coverage via full test suite / integration routes
- **Known Issues & Safety Implications**: Legacy 2025 Python scripts; not part of active Next.js architecture. Retain read-only for historical reference.
- **Recommended Action**: **`DEPRECATE`**

---

### [`snscrape/.git/HEAD`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/snscrape/.git/HEAD)

- **Relative Path**: `snscrape/.git/HEAD`
- **File Type**: `file` (1 lines, 23 bytes)
- **Category**: Legacy Python Root Codebase
- **Purpose & Responsibility**: Source file for application module
- **Main Exports / Entry Points**: *(None / Default entry point)*
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: *None*
- **Git Status**: Untracked
- **Existing Tests & Coverage**: Indirect coverage via full test suite / integration routes
- **Known Issues & Safety Implications**: Legacy 2025 Python scripts; not part of active Next.js architecture. Retain read-only for historical reference.
- **Recommended Action**: **`DEPRECATE`**

---

### [`snscrape/.git/config`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/snscrape/.git/config)

- **Relative Path**: `snscrape/.git/config`
- **File Type**: `file` (14 lines, 350 bytes)
- **Category**: Legacy Python Root Codebase
- **Purpose & Responsibility**: Source file for application module
- **Main Exports / Entry Points**: *(None / Default entry point)*
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: *None*
- **Git Status**: Untracked
- **Existing Tests & Coverage**: Indirect coverage via full test suite / integration routes
- **Known Issues & Safety Implications**: Legacy 2025 Python scripts; not part of active Next.js architecture. Retain read-only for historical reference.
- **Recommended Action**: **`DEPRECATE`**

---

### [`snscrape/.git/description`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/snscrape/.git/description)

- **Relative Path**: `snscrape/.git/description`
- **File Type**: `file` (1 lines, 73 bytes)
- **Category**: Legacy Python Root Codebase
- **Purpose & Responsibility**: Source file for application module
- **Main Exports / Entry Points**: *(None / Default entry point)*
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: *None*
- **Git Status**: Untracked
- **Existing Tests & Coverage**: Indirect coverage via full test suite / integration routes
- **Known Issues & Safety Implications**: Legacy 2025 Python scripts; not part of active Next.js architecture. Retain read-only for historical reference.
- **Recommended Action**: **`DEPRECATE`**

---

### [`snscrape/.git/hooks/applypatch-msg.sample`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/snscrape/.git/hooks/applypatch-msg.sample)

- **Relative Path**: `snscrape/.git/hooks/applypatch-msg.sample`
- **File Type**: `.sample` (15 lines, 478 bytes)
- **Category**: Legacy Python Root Codebase
- **Purpose & Responsibility**: !/bin/sh
- **Main Exports / Entry Points**: *(None / Default entry point)*
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: *None*
- **Git Status**: Untracked
- **Existing Tests & Coverage**: Indirect coverage via full test suite / integration routes
- **Known Issues & Safety Implications**: Legacy 2025 Python scripts; not part of active Next.js architecture. Retain read-only for historical reference.
- **Recommended Action**: **`DEPRECATE`**

---

### [`snscrape/.git/hooks/commit-msg.sample`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/snscrape/.git/hooks/commit-msg.sample)

- **Relative Path**: `snscrape/.git/hooks/commit-msg.sample`
- **File Type**: `.sample` (24 lines, 896 bytes)
- **Category**: Legacy Python Root Codebase
- **Purpose & Responsibility**: !/bin/sh
- **Main Exports / Entry Points**: *(None / Default entry point)*
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: *None*
- **Git Status**: Untracked
- **Existing Tests & Coverage**: Indirect coverage via full test suite / integration routes
- **Known Issues & Safety Implications**: Legacy 2025 Python scripts; not part of active Next.js architecture. Retain read-only for historical reference.
- **Recommended Action**: **`DEPRECATE`**

---

### [`snscrape/.git/hooks/fsmonitor-watchman.sample`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/snscrape/.git/hooks/fsmonitor-watchman.sample)

- **Relative Path**: `snscrape/.git/hooks/fsmonitor-watchman.sample`
- **File Type**: `.sample` (174 lines, 4,726 bytes)
- **Category**: Legacy Python Root Codebase
- **Purpose & Responsibility**: !/usr/bin/perl
- **Main Exports / Entry Points**: *(None / Default entry point)*
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: *None*
- **Git Status**: Untracked
- **Existing Tests & Coverage**: Indirect coverage via full test suite / integration routes
- **Known Issues & Safety Implications**: Legacy 2025 Python scripts; not part of active Next.js architecture. Retain read-only for historical reference.
- **Recommended Action**: **`DEPRECATE`**

---

### [`snscrape/.git/hooks/post-update.sample`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/snscrape/.git/hooks/post-update.sample)

- **Relative Path**: `snscrape/.git/hooks/post-update.sample`
- **File Type**: `.sample` (8 lines, 189 bytes)
- **Category**: Legacy Python Root Codebase
- **Purpose & Responsibility**: !/bin/sh
- **Main Exports / Entry Points**: *(None / Default entry point)*
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: *None*
- **Git Status**: Untracked
- **Existing Tests & Coverage**: Indirect coverage via full test suite / integration routes
- **Known Issues & Safety Implications**: Legacy 2025 Python scripts; not part of active Next.js architecture. Retain read-only for historical reference.
- **Recommended Action**: **`DEPRECATE`**

---

### [`snscrape/.git/hooks/pre-applypatch.sample`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/snscrape/.git/hooks/pre-applypatch.sample)

- **Relative Path**: `snscrape/.git/hooks/pre-applypatch.sample`
- **File Type**: `.sample` (14 lines, 424 bytes)
- **Category**: Legacy Python Root Codebase
- **Purpose & Responsibility**: !/bin/sh
- **Main Exports / Entry Points**: *(None / Default entry point)*
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: *None*
- **Git Status**: Untracked
- **Existing Tests & Coverage**: Indirect coverage via full test suite / integration routes
- **Known Issues & Safety Implications**: Legacy 2025 Python scripts; not part of active Next.js architecture. Retain read-only for historical reference.
- **Recommended Action**: **`DEPRECATE`**

---

### [`snscrape/.git/hooks/pre-commit.sample`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/snscrape/.git/hooks/pre-commit.sample)

- **Relative Path**: `snscrape/.git/hooks/pre-commit.sample`
- **File Type**: `.sample` (49 lines, 1,643 bytes)
- **Category**: Legacy Python Root Codebase
- **Purpose & Responsibility**: !/bin/sh
- **Main Exports / Entry Points**: *(None / Default entry point)*
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: *None*
- **Git Status**: Untracked
- **Existing Tests & Coverage**: Indirect coverage via full test suite / integration routes
- **Known Issues & Safety Implications**: Legacy 2025 Python scripts; not part of active Next.js architecture. Retain read-only for historical reference.
- **Recommended Action**: **`DEPRECATE`**

---

### [`snscrape/.git/hooks/pre-merge-commit.sample`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/snscrape/.git/hooks/pre-merge-commit.sample)

- **Relative Path**: `snscrape/.git/hooks/pre-merge-commit.sample`
- **File Type**: `.sample` (13 lines, 416 bytes)
- **Category**: Legacy Python Root Codebase
- **Purpose & Responsibility**: !/bin/sh
- **Main Exports / Entry Points**: *(None / Default entry point)*
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: *None*
- **Git Status**: Untracked
- **Existing Tests & Coverage**: Indirect coverage via full test suite / integration routes
- **Known Issues & Safety Implications**: Legacy 2025 Python scripts; not part of active Next.js architecture. Retain read-only for historical reference.
- **Recommended Action**: **`DEPRECATE`**

---

### [`snscrape/.git/hooks/pre-push.sample`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/snscrape/.git/hooks/pre-push.sample)

- **Relative Path**: `snscrape/.git/hooks/pre-push.sample`
- **File Type**: `.sample` (53 lines, 1,374 bytes)
- **Category**: Legacy Python Root Codebase
- **Purpose & Responsibility**: !/bin/sh
- **Main Exports / Entry Points**: *(None / Default entry point)*
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: *None*
- **Git Status**: Untracked
- **Existing Tests & Coverage**: Indirect coverage via full test suite / integration routes
- **Known Issues & Safety Implications**: Legacy 2025 Python scripts; not part of active Next.js architecture. Retain read-only for historical reference.
- **Recommended Action**: **`DEPRECATE`**

---

### [`snscrape/.git/hooks/pre-rebase.sample`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/snscrape/.git/hooks/pre-rebase.sample)

- **Relative Path**: `snscrape/.git/hooks/pre-rebase.sample`
- **File Type**: `.sample` (169 lines, 4,898 bytes)
- **Category**: Legacy Python Root Codebase
- **Purpose & Responsibility**: !/bin/sh
- **Main Exports / Entry Points**: *(None / Default entry point)*
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: *None*
- **Git Status**: Untracked
- **Existing Tests & Coverage**: Indirect coverage via full test suite / integration routes
- **Known Issues & Safety Implications**: Legacy 2025 Python scripts; not part of active Next.js architecture. Retain read-only for historical reference.
- **Recommended Action**: **`DEPRECATE`**

---

### [`snscrape/.git/hooks/pre-receive.sample`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/snscrape/.git/hooks/pre-receive.sample)

- **Relative Path**: `snscrape/.git/hooks/pre-receive.sample`
- **File Type**: `.sample` (24 lines, 544 bytes)
- **Category**: Legacy Python Root Codebase
- **Purpose & Responsibility**: !/bin/sh
- **Main Exports / Entry Points**: *(None / Default entry point)*
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: *None*
- **Git Status**: Untracked
- **Existing Tests & Coverage**: Indirect coverage via full test suite / integration routes
- **Known Issues & Safety Implications**: Legacy 2025 Python scripts; not part of active Next.js architecture. Retain read-only for historical reference.
- **Recommended Action**: **`DEPRECATE`**

---

### [`snscrape/.git/hooks/prepare-commit-msg.sample`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/snscrape/.git/hooks/prepare-commit-msg.sample)

- **Relative Path**: `snscrape/.git/hooks/prepare-commit-msg.sample`
- **File Type**: `.sample` (42 lines, 1,492 bytes)
- **Category**: Legacy Python Root Codebase
- **Purpose & Responsibility**: !/bin/sh
- **Main Exports / Entry Points**: *(None / Default entry point)*
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: *None*
- **Git Status**: Untracked
- **Existing Tests & Coverage**: Indirect coverage via full test suite / integration routes
- **Known Issues & Safety Implications**: Legacy 2025 Python scripts; not part of active Next.js architecture. Retain read-only for historical reference.
- **Recommended Action**: **`DEPRECATE`**

---

### [`snscrape/.git/hooks/push-to-checkout.sample`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/snscrape/.git/hooks/push-to-checkout.sample)

- **Relative Path**: `snscrape/.git/hooks/push-to-checkout.sample`
- **File Type**: `.sample` (78 lines, 2,783 bytes)
- **Category**: Legacy Python Root Codebase
- **Purpose & Responsibility**: !/bin/sh
- **Main Exports / Entry Points**: *(None / Default entry point)*
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: *None*
- **Git Status**: Untracked
- **Existing Tests & Coverage**: Indirect coverage via full test suite / integration routes
- **Known Issues & Safety Implications**: Legacy 2025 Python scripts; not part of active Next.js architecture. Retain read-only for historical reference.
- **Recommended Action**: **`DEPRECATE`**

---

### [`snscrape/.git/hooks/sendemail-validate.sample`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/snscrape/.git/hooks/sendemail-validate.sample)

- **Relative Path**: `snscrape/.git/hooks/sendemail-validate.sample`
- **File Type**: `.sample` (77 lines, 2,308 bytes)
- **Category**: Legacy Python Root Codebase
- **Purpose & Responsibility**: !/bin/sh
- **Main Exports / Entry Points**: *(None / Default entry point)*
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: *None*
- **Git Status**: Untracked
- **Existing Tests & Coverage**: Indirect coverage via full test suite / integration routes
- **Known Issues & Safety Implications**: Legacy 2025 Python scripts; not part of active Next.js architecture. Retain read-only for historical reference.
- **Recommended Action**: **`DEPRECATE`**

---

### [`snscrape/.git/hooks/update.sample`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/snscrape/.git/hooks/update.sample)

- **Relative Path**: `snscrape/.git/hooks/update.sample`
- **File Type**: `.sample` (128 lines, 3,650 bytes)
- **Category**: Legacy Python Root Codebase
- **Purpose & Responsibility**: !/bin/sh
- **Main Exports / Entry Points**: *(None / Default entry point)*
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: *None*
- **Git Status**: Untracked
- **Existing Tests & Coverage**: Indirect coverage via full test suite / integration routes
- **Known Issues & Safety Implications**: Legacy 2025 Python scripts; not part of active Next.js architecture. Retain read-only for historical reference.
- **Recommended Action**: **`DEPRECATE`**

---

### [`snscrape/.git/index`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/snscrape/.git/index)

- **Relative Path**: `snscrape/.git/index`
- **File Type**: `file` (74 lines, 2,099 bytes)
- **Category**: Legacy Python Root Codebase
- **Purpose & Responsibility**: Source file for application module
- **Main Exports / Entry Points**: *(None / Default entry point)*
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: *None*
- **Git Status**: Untracked
- **Existing Tests & Coverage**: Indirect coverage via full test suite / integration routes
- **Known Issues & Safety Implications**: Legacy 2025 Python scripts; not part of active Next.js architecture. Retain read-only for historical reference.
- **Recommended Action**: **`DEPRECATE`**

---

### [`snscrape/.git/info/exclude`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/snscrape/.git/info/exclude)

- **Relative Path**: `snscrape/.git/info/exclude`
- **File Type**: `file` (6 lines, 240 bytes)
- **Category**: Legacy Python Root Codebase
- **Purpose & Responsibility**: git ls-files --others --exclude-from=.git/info/exclude
- **Main Exports / Entry Points**: *(None / Default entry point)*
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: *None*
- **Git Status**: Untracked
- **Existing Tests & Coverage**: Indirect coverage via full test suite / integration routes
- **Known Issues & Safety Implications**: Legacy 2025 Python scripts; not part of active Next.js architecture. Retain read-only for historical reference.
- **Recommended Action**: **`DEPRECATE`**

---

### [`snscrape/.git/logs/HEAD`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/snscrape/.git/logs/HEAD)

- **Relative Path**: `snscrape/.git/logs/HEAD`
- **File Type**: `file` (1 lines, 200 bytes)
- **Category**: Legacy Python Root Codebase
- **Purpose & Responsibility**: Source file for application module
- **Main Exports / Entry Points**: *(None / Default entry point)*
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: *None*
- **Git Status**: Untracked
- **Existing Tests & Coverage**: Indirect coverage via full test suite / integration routes
- **Known Issues & Safety Implications**: Legacy 2025 Python scripts; not part of active Next.js architecture. Retain read-only for historical reference.
- **Recommended Action**: **`DEPRECATE`**

---

### [`snscrape/.git/logs/refs/heads/master`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/snscrape/.git/logs/refs/heads/master)

- **Relative Path**: `snscrape/.git/logs/refs/heads/master`
- **File Type**: `file` (1 lines, 200 bytes)
- **Category**: Legacy Python Root Codebase
- **Purpose & Responsibility**: Source file for application module
- **Main Exports / Entry Points**: *(None / Default entry point)*
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: *None*
- **Git Status**: Untracked
- **Existing Tests & Coverage**: Indirect coverage via full test suite / integration routes
- **Known Issues & Safety Implications**: Legacy 2025 Python scripts; not part of active Next.js architecture. Retain read-only for historical reference.
- **Recommended Action**: **`DEPRECATE`**

---

### [`snscrape/.git/logs/refs/remotes/origin/HEAD`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/snscrape/.git/logs/refs/remotes/origin/HEAD)

- **Relative Path**: `snscrape/.git/logs/refs/remotes/origin/HEAD`
- **File Type**: `file` (1 lines, 200 bytes)
- **Category**: Legacy Python Root Codebase
- **Purpose & Responsibility**: Source file for application module
- **Main Exports / Entry Points**: *(None / Default entry point)*
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: *None*
- **Git Status**: Untracked
- **Existing Tests & Coverage**: Indirect coverage via full test suite / integration routes
- **Known Issues & Safety Implications**: Legacy 2025 Python scripts; not part of active Next.js architecture. Retain read-only for historical reference.
- **Recommended Action**: **`DEPRECATE`**

---

### [`snscrape/.git/objects/pack/pack-820a0128e00065b001a9474c1308c03f1362dad0.idx`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/snscrape/.git/objects/pack/pack-820a0128e00065b001a9474c1308c03f1362dad0.idx)

- **Relative Path**: `snscrape/.git/objects/pack/pack-820a0128e00065b001a9474c1308c03f1362dad0.idx`
- **File Type**: `.idx` (1605 lines, 65,752 bytes)
- **Category**: Legacy Python Root Codebase
- **Purpose & Responsibility**: Source file for application module
- **Main Exports / Entry Points**: *(None / Default entry point)*
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: *None*
- **Git Status**: Untracked
- **Existing Tests & Coverage**: Indirect coverage via full test suite / integration routes
- **Known Issues & Safety Implications**: Legacy 2025 Python scripts; not part of active Next.js architecture. Retain read-only for historical reference.
- **Recommended Action**: **`DEPRECATE`**

---

### [`snscrape/.git/objects/pack/pack-820a0128e00065b001a9474c1308c03f1362dad0.pack`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/snscrape/.git/objects/pack/pack-820a0128e00065b001a9474c1308c03f1362dad0.pack)

- **Relative Path**: `snscrape/.git/objects/pack/pack-820a0128e00065b001a9474c1308c03f1362dad0.pack`
- **File Type**: `.pack` (10323 lines, 385,360 bytes)
- **Category**: Legacy Python Root Codebase
- **Purpose & Responsibility**: Source file for application module
- **Main Exports / Entry Points**: *(None / Default entry point)*
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: *None*
- **Git Status**: Untracked
- **Existing Tests & Coverage**: Indirect coverage via full test suite / integration routes
- **Known Issues & Safety Implications**: Legacy 2025 Python scripts; not part of active Next.js architecture. Retain read-only for historical reference.
- **Recommended Action**: **`DEPRECATE`**

---

### [`snscrape/.git/objects/pack/pack-820a0128e00065b001a9474c1308c03f1362dad0.rev`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/snscrape/.git/objects/pack/pack-820a0128e00065b001a9474c1308c03f1362dad0.rev)

- **Relative Path**: `snscrape/.git/objects/pack/pack-820a0128e00065b001a9474c1308c03f1362dad0.rev`
- **File Type**: `.rev` (66 lines, 9,292 bytes)
- **Category**: Legacy Python Root Codebase
- **Purpose & Responsibility**: Source file for application module
- **Main Exports / Entry Points**: *(None / Default entry point)*
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: *None*
- **Git Status**: Untracked
- **Existing Tests & Coverage**: Indirect coverage via full test suite / integration routes
- **Known Issues & Safety Implications**: Legacy 2025 Python scripts; not part of active Next.js architecture. Retain read-only for historical reference.
- **Recommended Action**: **`DEPRECATE`**

---

### [`snscrape/.git/packed-refs`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/snscrape/.git/packed-refs)

- **Relative Path**: `snscrape/.git/packed-refs`
- **File Type**: `file` (41 lines, 2,160 bytes)
- **Category**: Legacy Python Root Codebase
- **Purpose & Responsibility**: pack-refs with: peeled fully-peeled sorted
- **Main Exports / Entry Points**: *(None / Default entry point)*
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: *None*
- **Git Status**: Untracked
- **Existing Tests & Coverage**: Indirect coverage via full test suite / integration routes
- **Known Issues & Safety Implications**: Legacy 2025 Python scripts; not part of active Next.js architecture. Retain read-only for historical reference.
- **Recommended Action**: **`DEPRECATE`**

---

### [`snscrape/.git/refs/heads/master`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/snscrape/.git/refs/heads/master)

- **Relative Path**: `snscrape/.git/refs/heads/master`
- **File Type**: `file` (1 lines, 41 bytes)
- **Category**: Legacy Python Root Codebase
- **Purpose & Responsibility**: Source file for application module
- **Main Exports / Entry Points**: *(None / Default entry point)*
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: *None*
- **Git Status**: Untracked
- **Existing Tests & Coverage**: Indirect coverage via full test suite / integration routes
- **Known Issues & Safety Implications**: Legacy 2025 Python scripts; not part of active Next.js architecture. Retain read-only for historical reference.
- **Recommended Action**: **`DEPRECATE`**

---

### [`snscrape/.git/refs/remotes/origin/HEAD`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/snscrape/.git/refs/remotes/origin/HEAD)

- **Relative Path**: `snscrape/.git/refs/remotes/origin/HEAD`
- **File Type**: `file` (1 lines, 32 bytes)
- **Category**: Legacy Python Root Codebase
- **Purpose & Responsibility**: Source file for application module
- **Main Exports / Entry Points**: *(None / Default entry point)*
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: *None*
- **Git Status**: Untracked
- **Existing Tests & Coverage**: Indirect coverage via full test suite / integration routes
- **Known Issues & Safety Implications**: Legacy 2025 Python scripts; not part of active Next.js architecture. Retain read-only for historical reference.
- **Recommended Action**: **`DEPRECATE`**

---

### [`snscrape/.github/ISSUE_TEMPLATE/bug_report.yml`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/snscrape/.github/ISSUE_TEMPLATE/bug_report.yml)

- **Relative Path**: `snscrape/.github/ISSUE_TEMPLATE/bug_report.yml`
- **File Type**: `.yml` (97 lines, 3,679 bytes)
- **Category**: Legacy Python Root Codebase
- **Purpose & Responsibility**: Self Check
- **Main Exports / Entry Points**: *(None / Default entry point)*
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: *None*
- **Git Status**: Untracked
- **Existing Tests & Coverage**: Indirect coverage via full test suite / integration routes
- **Known Issues & Safety Implications**: Legacy 2025 Python scripts; not part of active Next.js architecture. Retain read-only for historical reference.
- **Recommended Action**: **`DEPRECATE`**

---

### [`snscrape/.github/ISSUE_TEMPLATE/feature_request.yml`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/snscrape/.github/ISSUE_TEMPLATE/feature_request.yml)

- **Relative Path**: `snscrape/.github/ISSUE_TEMPLATE/feature_request.yml`
- **File Type**: `.yml` (27 lines, 784 bytes)
- **Category**: Legacy Python Root Codebase
- **Purpose & Responsibility**: Self Check
- **Main Exports / Entry Points**: *(None / Default entry point)*
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: *None*
- **Git Status**: Untracked
- **Existing Tests & Coverage**: Indirect coverage via full test suite / integration routes
- **Known Issues & Safety Implications**: Legacy 2025 Python scripts; not part of active Next.js architecture. Retain read-only for historical reference.
- **Recommended Action**: **`DEPRECATE`**

---

### [`snscrape/.github/ISSUE_TEMPLATE/question.md`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/snscrape/.github/ISSUE_TEMPLATE/question.md)

- **Relative Path**: `snscrape/.github/ISSUE_TEMPLATE/question.md`
- **File Type**: `.md` (6 lines, 106 bytes)
- **Category**: Legacy Python Root Codebase
- **Purpose & Responsibility**: Source file for application module
- **Main Exports / Entry Points**: *(None / Default entry point)*
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: *None*
- **Git Status**: Untracked
- **Existing Tests & Coverage**: Indirect coverage via full test suite / integration routes
- **Known Issues & Safety Implications**: Legacy 2025 Python scripts; not part of active Next.js architecture. Retain read-only for historical reference.
- **Recommended Action**: **`DEPRECATE`**

---

### [`snscrape/.gitignore`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/snscrape/.gitignore)

- **Relative Path**: `snscrape/.gitignore`
- **File Type**: `file` (4 lines, 52 bytes)
- **Category**: Legacy Python Root Codebase
- **Purpose & Responsibility**: Source file for application module
- **Main Exports / Entry Points**: *(None / Default entry point)*
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: *None*
- **Git Status**: Untracked
- **Existing Tests & Coverage**: Indirect coverage via full test suite / integration routes
- **Known Issues & Safety Implications**: Legacy 2025 Python scripts; not part of active Next.js architecture. Retain read-only for historical reference.
- **Recommended Action**: **`DEPRECATE`**

---

### [`snscrape/LICENSE`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/snscrape/LICENSE)

- **Relative Path**: `snscrape/LICENSE`
- **File Type**: `file` (674 lines, 35,823 bytes)
- **Category**: Legacy Python Root Codebase
- **Purpose & Responsibility**: Source file for application module
- **Main Exports / Entry Points**: *(None / Default entry point)*
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: *None*
- **Git Status**: Untracked
- **Existing Tests & Coverage**: Indirect coverage via full test suite / integration routes
- **Known Issues & Safety Implications**: Legacy 2025 Python scripts; not part of active Next.js architecture. Retain read-only for historical reference.
- **Recommended Action**: **`DEPRECATE`**

---

### [`snscrape/README.md`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/snscrape/README.md)

- **Relative Path**: `snscrape/README.md`
- **File Type**: `.md` (72 lines, 4,148 bytes)
- **Category**: Legacy Python Root Codebase
- **Purpose & Responsibility**: snscrape
- **Main Exports / Entry Points**: *(None / Default entry point)*
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: *None*
- **Git Status**: Untracked
- **Existing Tests & Coverage**: Indirect coverage via full test suite / integration routes
- **Known Issues & Safety Implications**: Legacy 2025 Python scripts; not part of active Next.js architecture. Retain read-only for historical reference.
- **Recommended Action**: **`DEPRECATE`**

---

### [`snscrape/pyproject.toml`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/snscrape/pyproject.toml)

- **Relative Path**: `snscrape/pyproject.toml`
- **File Type**: `.toml` (37 lines, 973 bytes)
- **Category**: Legacy Python Root Codebase
- **Purpose & Responsibility**: Source file for application module
- **Main Exports / Entry Points**: *(None / Default entry point)*
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: *None*
- **Git Status**: Untracked
- **Existing Tests & Coverage**: Indirect coverage via full test suite / integration routes
- **Known Issues & Safety Implications**: Legacy 2025 Python scripts; not part of active Next.js architecture. Retain read-only for historical reference.
- **Recommended Action**: **`DEPRECATE`**

---

### [`snscrape/snscrape.egg-info/PKG-INFO`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/snscrape/snscrape.egg-info/PKG-INFO)

- **Relative Path**: `snscrape/snscrape.egg-info/PKG-INFO`
- **File Type**: `file` (94 lines, 4,970 bytes)
- **Category**: Legacy Python Root Codebase
- **Purpose & Responsibility**: Source file for application module
- **Main Exports / Entry Points**: *(None / Default entry point)*
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: *None*
- **Git Status**: Untracked
- **Existing Tests & Coverage**: Indirect coverage via full test suite / integration routes
- **Known Issues & Safety Implications**: Legacy 2025 Python scripts; not part of active Next.js architecture. Retain read-only for historical reference.
- **Recommended Action**: **`DEPRECATE`**

---

### [`snscrape/snscrape.egg-info/SOURCES.txt`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/snscrape/snscrape.egg-info/SOURCES.txt)

- **Relative Path**: `snscrape/snscrape.egg-info/SOURCES.txt`
- **File Type**: `.txt` (27 lines, 703 bytes)
- **Category**: Legacy Python Root Codebase
- **Purpose & Responsibility**: Source file for application module
- **Main Exports / Entry Points**: *(None / Default entry point)*
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: *None*
- **Git Status**: Untracked
- **Existing Tests & Coverage**: Indirect coverage via full test suite / integration routes
- **Known Issues & Safety Implications**: Legacy 2025 Python scripts; not part of active Next.js architecture. Retain read-only for historical reference.
- **Recommended Action**: **`DEPRECATE`**

---

### [`snscrape/snscrape.egg-info/dependency_links.txt`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/snscrape/snscrape.egg-info/dependency_links.txt)

- **Relative Path**: `snscrape/snscrape.egg-info/dependency_links.txt`
- **File Type**: `.txt` (1 lines, 1 bytes)
- **Category**: Legacy Python Root Codebase
- **Purpose & Responsibility**: Source file for application module
- **Main Exports / Entry Points**: *(None / Default entry point)*
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: *None*
- **Git Status**: Untracked
- **Existing Tests & Coverage**: Indirect coverage via full test suite / integration routes
- **Known Issues & Safety Implications**: Legacy 2025 Python scripts; not part of active Next.js architecture. Retain read-only for historical reference.
- **Recommended Action**: **`DEPRECATE`**

---

### [`snscrape/snscrape.egg-info/entry_points.txt`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/snscrape/snscrape.egg-info/entry_points.txt)

- **Relative Path**: `snscrape/snscrape.egg-info/entry_points.txt`
- **File Type**: `.txt` (2 lines, 48 bytes)
- **Category**: Legacy Python Root Codebase
- **Purpose & Responsibility**: Source file for application module
- **Main Exports / Entry Points**: *(None / Default entry point)*
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: *None*
- **Git Status**: Untracked
- **Existing Tests & Coverage**: Indirect coverage via full test suite / integration routes
- **Known Issues & Safety Implications**: Legacy 2025 Python scripts; not part of active Next.js architecture. Retain read-only for historical reference.
- **Recommended Action**: **`DEPRECATE`**

---

### [`snscrape/snscrape.egg-info/requires.txt`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/snscrape/snscrape.egg-info/requires.txt)

- **Relative Path**: `snscrape/snscrape.egg-info/requires.txt`
- **File Type**: `.txt` (7 lines, 79 bytes)
- **Category**: Legacy Python Root Codebase
- **Purpose & Responsibility**: Source file for application module
- **Main Exports / Entry Points**: *(None / Default entry point)*
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: *None*
- **Git Status**: Untracked
- **Existing Tests & Coverage**: Indirect coverage via full test suite / integration routes
- **Known Issues & Safety Implications**: Legacy 2025 Python scripts; not part of active Next.js architecture. Retain read-only for historical reference.
- **Recommended Action**: **`DEPRECATE`**

---

### [`snscrape/snscrape.egg-info/top_level.txt`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/snscrape/snscrape.egg-info/top_level.txt)

- **Relative Path**: `snscrape/snscrape.egg-info/top_level.txt`
- **File Type**: `.txt` (1 lines, 9 bytes)
- **Category**: Legacy Python Root Codebase
- **Purpose & Responsibility**: Source file for application module
- **Main Exports / Entry Points**: *(None / Default entry point)*
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: *None*
- **Git Status**: Untracked
- **Existing Tests & Coverage**: Indirect coverage via full test suite / integration routes
- **Known Issues & Safety Implications**: Legacy 2025 Python scripts; not part of active Next.js architecture. Retain read-only for historical reference.
- **Recommended Action**: **`DEPRECATE`**

---

### [`snscrape/snscrape/__init__.py`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/snscrape/snscrape/__init__.py)

- **Relative Path**: `snscrape/snscrape/__init__.py`
- **File Type**: `.py` (0 lines, 0 bytes)
- **Category**: Legacy Python Root Codebase
- **Purpose & Responsibility**: Source file for application module
- **Main Exports / Entry Points**: *(None / Default entry point)*
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: *None*
- **Git Status**: Untracked
- **Existing Tests & Coverage**: Indirect coverage via full test suite / integration routes
- **Known Issues & Safety Implications**: Legacy 2025 Python scripts; not part of active Next.js architecture. Retain read-only for historical reference.
- **Recommended Action**: **`DEPRECATE`**

---

### [`snscrape/snscrape/_cli.py`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/snscrape/snscrape/_cli.py)

- **Relative Path**: `snscrape/snscrape/_cli.py`
- **File Type**: `.py` (346 lines, 13,488 bytes)
- **Category**: Legacy Python Root Codebase
- **Purpose & Responsibility**: Imported in parse_args() after setting up the logger:
- **Main Exports / Entry Points**: `Logger`, `_requests_request_repr`, `_requests_response_repr`, `_requests_exception_repr`, `_repr`, `_dump_locals_on_exception`, `_dump_stack_and_locals`, `parse_datetime_arg` *(+6 more)*
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: `argparse`, `collections`, `contextlib`, `dataclasses`, `datetime` *(+10 more)*
- **Git Status**: Untracked
- **Existing Tests & Coverage**: Indirect coverage via full test suite / integration routes
- **Known Issues & Safety Implications**: Legacy 2025 Python scripts; not part of active Next.js architecture. Retain read-only for historical reference.
- **Recommended Action**: **`DEPRECATE`**

---

### [`snscrape/snscrape/base.py`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/snscrape/snscrape/base.py)

- **Relative Path**: `snscrape/snscrape/base.py`
- **File Type**: `.py` (293 lines, 10,788 bytes)
- **Category**: Legacy Python Root Codebase
- **Purpose & Responsibility**: Source file for application module
- **Main Exports / Entry Points**: `DeprecatedFeatureWarning`, `_DeprecatedProperty`, `_json_serialise_datetime_enum`, `_json_dataclass_to_dict`, `_JSONDataclass`, `Item`, `IntWithGranularity`, `_random_user_agent` *(+5 more)*
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: `abc`, `copy`, `dataclasses`, `datetime`, `enum` *(+11 more)*
- **Git Status**: Untracked
- **Existing Tests & Coverage**: Indirect coverage via full test suite / integration routes
- **Known Issues & Safety Implications**: Legacy 2025 Python scripts; not part of active Next.js architecture. Retain read-only for historical reference.
- **Recommended Action**: **`DEPRECATE`**

---

### [`snscrape/snscrape/modules/__init__.py`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/snscrape/snscrape/modules/__init__.py)

- **Relative Path**: `snscrape/snscrape/modules/__init__.py`
- **File Type**: `.py` (17 lines, 442 bytes)
- **Category**: Legacy Python Root Codebase
- **Purpose & Responsibility**: Source file for application module
- **Main Exports / Entry Points**: `_import_modules`
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: `pkgutil`
- **Git Status**: Untracked
- **Existing Tests & Coverage**: Indirect coverage via full test suite / integration routes
- **Known Issues & Safety Implications**: Legacy 2025 Python scripts; not part of active Next.js architecture. Retain read-only for historical reference.
- **Recommended Action**: **`DEPRECATE`**

---

### [`snscrape/snscrape/modules/facebook.py`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/snscrape/snscrape/modules/facebook.py)

- **Relative Path**: `snscrape/snscrape/modules/facebook.py`
- **File Type**: `.py` (365 lines, 16,369 bytes)
- **Category**: Legacy Python Root Codebase
- **Purpose & Responsibility**: Source file for application module
- **Main Exports / Entry Points**: `FacebookPost`, `User`, `_FacebookCommonScraper`, `_FacebookUserAndCommunityScraper`, `FacebookUserScraper`, `FacebookCommunityScraper`, `FacebookGroupScraper`
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: `bs4`, `dataclasses`, `datetime`, `json`, `logging` *(+5 more)*
- **Git Status**: Untracked
- **Existing Tests & Coverage**: Indirect coverage via full test suite / integration routes
- **Known Issues & Safety Implications**: Legacy 2025 Python scripts; not part of active Next.js architecture. Retain read-only for historical reference.
- **Recommended Action**: **`DEPRECATE`**

---

### [`snscrape/snscrape/modules/instagram.py`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/snscrape/snscrape/modules/instagram.py)

- **Relative Path**: `snscrape/snscrape/modules/instagram.py`
- **File Type**: `.py` (244 lines, 10,116 bytes)
- **Category**: Legacy Python Root Codebase
- **Purpose & Responsibility**: Source file for application module
- **Main Exports / Entry Points**: `InstagramPost`, `User`, `_InstagramCommonScraper`, `InstagramUserScraper`, `InstagramHashtagScraper`, `InstagramLocationScraper`
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: `dataclasses`, `datetime`, `hashlib`, `json`, `logging` *(+4 more)*
- **Git Status**: Untracked
- **Existing Tests & Coverage**: Indirect coverage via full test suite / integration routes
- **Known Issues & Safety Implications**: Legacy 2025 Python scripts; not part of active Next.js architecture. Retain read-only for historical reference.
- **Recommended Action**: **`DEPRECATE`**

---

### [`snscrape/snscrape/modules/mastodon.py`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/snscrape/snscrape/modules/mastodon.py)

- **Relative Path**: `snscrape/snscrape/modules/mastodon.py`
- **File Type**: `.py` (341 lines, 13,650 bytes)
- **Category**: Legacy Python Root Codebase
- **Purpose & Responsibility**: Source file for application module
- **Main Exports / Entry Points**: `Toot`, `Boost`, `Attachment`, `Poll`, `PollOption`, `User`, `CustomEmoji`, `_MastodonCommonScraper` *(+3 more)*
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: `bs4`, `dataclasses`, `datetime`, `enum`, `json` *(+6 more)*
- **Git Status**: Untracked
- **Existing Tests & Coverage**: Indirect coverage via full test suite / integration routes
- **Known Issues & Safety Implications**: Legacy 2025 Python scripts; not part of active Next.js architecture. Retain read-only for historical reference.
- **Recommended Action**: **`DEPRECATE`**

---

### [`snscrape/snscrape/modules/reddit.py`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/snscrape/snscrape/modules/reddit.py)

- **Relative Path**: `snscrape/snscrape/modules/reddit.py`
- **File Type**: `.py` (280 lines, 10,191 bytes)
- **Category**: Legacy Python Root Codebase
- **Purpose & Responsibility**: Source file for application module
- **Main Exports / Entry Points**: `Submission`, `Comment`, `_cmp_id`, `_RedditPushshiftScraper`, `_RedditPushshiftSearchScraper`, `RedditUserScraper`, `RedditSubredditScraper`, `RedditSearchScraper` *(+1 more)*
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: `dataclasses`, `datetime`, `logging`, `re`, `snscrape.base` *(+5 more)*
- **Git Status**: Untracked
- **Existing Tests & Coverage**: Indirect coverage via full test suite / integration routes
- **Known Issues & Safety Implications**: Legacy 2025 Python scripts; not part of active Next.js architecture. Retain read-only for historical reference.
- **Recommended Action**: **`DEPRECATE`**

---

### [`snscrape/snscrape/modules/telegram.py`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/snscrape/snscrape/modules/telegram.py)

- **Relative Path**: `snscrape/snscrape/modules/telegram.py`
- **File Type**: `.py` (204 lines, 8,995 bytes)
- **Category**: Legacy Python Root Codebase
- **Purpose & Responsibility**: Source file for application module
- **Main Exports / Entry Points**: `LinkPreview`, `TelegramPost`, `Channel`, `TelegramChannelScraper`
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: `bs4`, `dataclasses`, `datetime`, `logging`, `re` *(+4 more)*
- **Git Status**: Untracked
- **Existing Tests & Coverage**: Indirect coverage via full test suite / integration routes
- **Known Issues & Safety Implications**: Legacy 2025 Python scripts; not part of active Next.js architecture. Retain read-only for historical reference.
- **Recommended Action**: **`DEPRECATE`**

---

### [`snscrape/snscrape/modules/twitter.py`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/snscrape/snscrape/modules/twitter.py)

- **Relative Path**: `snscrape/snscrape/modules/twitter.py`
- **File Type**: `.py` (2321 lines, 99,386 bytes)
- **Category**: Legacy Python Root Codebase
- **Purpose & Responsibility**: Source file for application module
- **Main Exports / Entry Points**: `Tweet`, `TextLink`, `Medium`, `Photo`, `VideoVariant`, `Video`, `Gif`, `Coordinates` *(+63 more)*
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: `base64`, `collections`, `copy`, `dataclasses`, `datetime` *(+19 more)*
- **Git Status**: Untracked
- **Existing Tests & Coverage**: Indirect coverage via full test suite / integration routes
- **Known Issues & Safety Implications**: Legacy 2025 Python scripts; not part of active Next.js architecture. Retain read-only for historical reference.
- **Recommended Action**: **`DEPRECATE`**

---

### [`snscrape/snscrape/modules/vkontakte.py`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/snscrape/snscrape/modules/vkontakte.py)

- **Relative Path**: `snscrape/snscrape/modules/vkontakte.py`
- **File Type**: `.py` (392 lines, 17,626 bytes)
- **Category**: Legacy Python Root Codebase
- **Purpose & Responsibility**: Source file for application module
- **Main Exports / Entry Points**: `VKontaktePost`, `Photo`, `PhotoVariant`, `Video`, `User`, `VKontakteUserScraper`
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: `bs4`, `collections`, `dataclasses`, `datetime`, `itertools` *(+9 more)*
- **Git Status**: Untracked
- **Existing Tests & Coverage**: Indirect coverage via full test suite / integration routes
- **Known Issues & Safety Implications**: Legacy 2025 Python scripts; not part of active Next.js architecture. Retain read-only for historical reference.
- **Recommended Action**: **`DEPRECATE`**

---

### [`snscrape/snscrape/modules/weibo.py`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/snscrape/snscrape/modules/weibo.py)

- **Relative Path**: `snscrape/snscrape/modules/weibo.py`
- **File Type**: `.py` (154 lines, 6,126 bytes)
- **Category**: Legacy Python Root Codebase
- **Purpose & Responsibility**: Source file for application module
- **Main Exports / Entry Points**: `Post`, `User`, `WeiboUserScraper`
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: `dataclasses`, `logging`, `re`, `snscrape.base`, `snscrape.utils` *(+1 more)*
- **Git Status**: Untracked
- **Existing Tests & Coverage**: Indirect coverage via full test suite / integration routes
- **Known Issues & Safety Implications**: Legacy 2025 Python scripts; not part of active Next.js architecture. Retain read-only for historical reference.
- **Recommended Action**: **`DEPRECATE`**

---

### [`snscrape/snscrape/utils.py`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/snscrape/snscrape/utils.py)

- **Relative Path**: `snscrape/snscrape/utils.py`
- **File Type**: `.py` (41 lines, 1,428 bytes)
- **Category**: Legacy Python Root Codebase
- **Purpose & Responsibility**: Source file for application module
- **Main Exports / Entry Points**: `dict_map`, `snake_to_camel`, `nonempty_string_arg`, `module_deprecation_helper`
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: *None*
- **Git Status**: Untracked
- **Existing Tests & Coverage**: Indirect coverage via full test suite / integration routes
- **Known Issues & Safety Implications**: Legacy 2025 Python scripts; not part of active Next.js architecture. Retain read-only for historical reference.
- **Recommended Action**: **`DEPRECATE`**

---

### [`snscrape/snscrape/version.py`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/snscrape/snscrape/version.py)

- **Relative Path**: `snscrape/snscrape/version.py`
- **File Type**: `.py` (7 lines, 162 bytes)
- **Category**: Legacy Python Root Codebase
- **Purpose & Responsibility**: Source file for application module
- **Main Exports / Entry Points**: *(None / Default entry point)*
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: `importlib.metadata`
- **Git Status**: Untracked
- **Existing Tests & Coverage**: Indirect coverage via full test suite / integration routes
- **Known Issues & Safety Implications**: Legacy 2025 Python scripts; not part of active Next.js architecture. Retain read-only for historical reference.
- **Recommended Action**: **`DEPRECATE`**

---

### [`tradingview_data/__init__.py`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/tradingview_data/__init__.py)

- **Relative Path**: `tradingview_data/__init__.py`
- **File Type**: `.py` (0 lines, 0 bytes)
- **Category**: Legacy Python Root Codebase
- **Purpose & Responsibility**: Source file for application module
- **Main Exports / Entry Points**: *(None / Default entry point)*
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: *None*
- **Git Status**: Tracked (Clean)
- **Existing Tests & Coverage**: Indirect coverage via full test suite / integration routes
- **Known Issues & Safety Implications**: Legacy 2025 Python scripts; not part of active Next.js architecture. Retain read-only for historical reference.
- **Recommended Action**: **`DEPRECATE`**

---

### [`tradingview_data/tv_fetcher.py`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/tradingview_data/tv_fetcher.py)

- **Relative Path**: `tradingview_data/tv_fetcher.py`
- **File Type**: `.py` (54 lines, 2,256 bytes)
- **Category**: Legacy Python Root Codebase
- **Purpose & Responsibility**: Set up logging
- **Main Exports / Entry Points**: `fetch_spot_data`
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: `dotenv`, `logging`, `os`, `tvDatafeed`
- **Git Status**: Tracked (Clean)
- **Existing Tests & Coverage**: Indirect coverage via full test suite / integration routes
- **Known Issues & Safety Implications**: Legacy 2025 Python scripts; not part of active Next.js architecture. Retain read-only for historical reference.
- **Recommended Action**: **`DEPRECATE`**

---

### [`twitter_sentiment_cache.pkl`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/twitter_sentiment_cache.pkl)

- **Relative Path**: `twitter_sentiment_cache.pkl`
- **File Type**: `.pkl` (2 lines, 83 bytes)
- **Category**: Legacy Python Root Codebase
- **Purpose & Responsibility**: Source file for application module
- **Main Exports / Entry Points**: *(None / Default entry point)*
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: *None*
- **Git Status**: Untracked
- **Existing Tests & Coverage**: Indirect coverage via full test suite / integration routes
- **Known Issues & Safety Implications**: Legacy 2025 Python scripts; not part of active Next.js architecture. Retain read-only for historical reference.
- **Recommended Action**: **`DEPRECATE`**

---

### [`upstox_analyzer.log`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/upstox_analyzer.log)

- **Relative Path**: `upstox_analyzer.log`
- **File Type**: `.log` (0 lines, 0 bytes)
- **Category**: Legacy Python Root Codebase
- **Purpose & Responsibility**: Source file for application module
- **Main Exports / Entry Points**: *(None / Default entry point)*
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: *None*
- **Git Status**: Untracked
- **Existing Tests & Coverage**: Indirect coverage via full test suite / integration routes
- **Known Issues & Safety Implications**: Legacy 2025 Python scripts; not part of active Next.js architecture. Retain read-only for historical reference.
- **Recommended Action**: **`DEPRECATE`**

---

### [`upstox_api/auth_login.py`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/upstox_api/auth_login.py)

- **Relative Path**: `upstox_api/auth_login.py`
- **File Type**: `.py` (67 lines, 2,135 bytes)
- **Category**: Legacy Python Root Codebase
- **Purpose & Responsibility**: auth_login.py
- **Main Exports / Entry Points**: `generate_authorization_url`, `get_access_token`, `login_and_get_access_token`
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: `dotenv`, `os`, `requests`, `urllib.parse`, `webbrowser`
- **Git Status**: Tracked (Clean)
- **Existing Tests & Coverage**: Indirect coverage via full test suite / integration routes
- **Known Issues & Safety Implications**: Legacy 2025 Python scripts; not part of active Next.js architecture. Retain read-only for historical reference.
- **Recommended Action**: **`DEPRECATE`**

---

### [`upstox_api/fetch_historical_data.py`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/upstox_api/fetch_historical_data.py)

- **Relative Path**: `upstox_api/fetch_historical_data.py`
- **File Type**: `.py` (91 lines, 3,815 bytes)
- **Category**: Legacy Python Root Codebase
- **Purpose & Responsibility**: fetch_historical_data.py
- **Main Exports / Entry Points**: `fetch_historical_data_with_retry`, `fetch_historical_data`
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: `datetime`, `logging`, `pandas`, `requests`, `tenacity` *(+1 more)*
- **Git Status**: Tracked (Clean)
- **Existing Tests & Coverage**: Indirect coverage via full test suite / integration routes
- **Known Issues & Safety Implications**: Legacy 2025 Python scripts; not part of active Next.js architecture. Retain read-only for historical reference.
- **Recommended Action**: **`DEPRECATE`**

---

### [`upstox_api/fetch_instruments.py`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/upstox_api/fetch_instruments.py)

- **Relative Path**: `upstox_api/fetch_instruments.py`
- **File Type**: `.py` (24 lines, 831 bytes)
- **Category**: Legacy Python Root Codebase
- **Purpose & Responsibility**: upstox_api/fetch_instruments.py
- **Main Exports / Entry Points**: `fetch_instruments`
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: `gzip`, `io`, `json`, `requests`
- **Git Status**: Tracked (Clean)
- **Existing Tests & Coverage**: Indirect coverage via full test suite / integration routes
- **Known Issues & Safety Implications**: Legacy 2025 Python scripts; not part of active Next.js architecture. Retain read-only for historical reference.
- **Recommended Action**: **`DEPRECATE`**

---

### [`upstox_api/fetch_option_chain.py`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/upstox_api/fetch_option_chain.py)

- **Relative Path**: `upstox_api/fetch_option_chain.py`
- **File Type**: `.py` (217 lines, 8,503 bytes)
- **Category**: Legacy Python Root Codebase
- **Purpose & Responsibility**: Set up logging
- **Main Exports / Entry Points**: `load_cache`, `save_cache`, `get_nearest_expiry`, `fetch_option_chain`, `fetch_spot_price`
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: `datetime`, `logging`, `os`, `pickle`, `requests`
- **Git Status**: Tracked (Clean)
- **Existing Tests & Coverage**: Indirect coverage via full test suite / integration routes
- **Known Issues & Safety Implications**: Legacy 2025 Python scripts; not part of active Next.js architecture. Retain read-only for historical reference.
- **Recommended Action**: **`DEPRECATE`**

---
