[coco]
version = "0.7.1-rc.2"

[module]
name = "Intelligence"
version = "1.0.0"
license = ["MIT"]
repository = "https://github.com/intelligence/participant-intelligence-service"
authors = ["Participant Intelligence Team"]

[target]
os = "MOI"
arch = "PISA"

[target.moi]
format = "JSON"
output = "intelligence"

[target.pisa]
format = "ASM"
version = "0.6.0"

[lab.render]
big_int_as_hex = true
bytes_as_hex = false

[lab.config.default]
env = "main"

# run lab.scripts with with script name e.g. "coco lab run test-intelligence"
[lab.scripts]
test-intelligence = [
    "compile Intelligence from manifest(intelligence.json)",
    "register X",
    "register rahul",
    "register robert",

    # --- SetCategoryRef: set all 4 categories for rahul ---
    "invoke Intelligence.SetCategoryRef(category: \"FOOD\", ref: \"fish\", schema_version: \"1.1\", updated_at: 1773412350) as rahul",
    "invoke Intelligence.SetCategoryRef(category: \"HEALTH\", ref: \"vitals\", schema_version: \"1.0\", updated_at: 1773412350) as rahul",
    "invoke Intelligence.SetCategoryRef(category: \"ADDRESS\", ref: \"home\", schema_version: \"1.1\", updated_at: 1773412351) as rahul",
    "invoke Intelligence.SetCategoryRef(category: \"PAYMENT\", ref: \"card\", schema_version: \"1.0\", updated_at: 1773412351) as rahul",

    # --- SetCategoryRef: set all 4 categories for robert ---
    "invoke Intelligence.SetCategoryRef(category: \"FOOD\", ref: \"milk\", schema_version: \"1.2\", updated_at: 1773412351) as robert",
    "invoke Intelligence.SetCategoryRef(category: \"HEALTH\", ref: \"records\", schema_version: \"1.0\", updated_at: 1773412351) as robert",
    "invoke Intelligence.SetCategoryRef(category: \"ADDRESS\", ref: \"office\", schema_version: \"1.0\", updated_at: 1773412351) as robert",
    "invoke Intelligence.SetCategoryRef(category: \"PAYMENT\", ref: \"bank\", schema_version: \"1.0\", updated_at: 1773412351) as robert",

    # --- GetCategoryRef ---
    "invoke Intelligence.GetCategoryRef(actor_id: rahul, category: \"FOOD\") as X",
    "invoke Intelligence.GetCategoryRef(actor_id: rahul, category: \"ADDRESS\") as X",
    "invoke Intelligence.GetCategoryRef(actor_id: robert, category: \"FOOD\") as X",

    # --- ListCategoryRefs ---
    "invoke Intelligence.ListCategoryRefs(actor_id: rahul) as X",
    "invoke Intelligence.ListCategoryRefs(actor_id: robert) as X",

    # --- RemoveCategoryRef ---
    "invoke Intelligence.RemoveCategoryRef(category: \"ADDRESS\", updated_at: 1773412352) as rahul",
    "invoke Intelligence.GetCategoryRef(actor_id: rahul, category: \"ADDRESS\") as X",

    # --- GetVersion / GetLastUpdatedAt ---
    "invoke Intelligence.GetVersion(actor_id: rahul) as X",
    "invoke Intelligence.GetLastUpdatedAt(actor_id: rahul) as X",
    "invoke Intelligence.GetVersion(actor_id: robert) as X",
    "invoke Intelligence.GetLastUpdatedAt(actor_id: robert) as X",

    # --- SetCategoryRef overwrite ---
    "invoke Intelligence.SetCategoryRef(category: \"FOOD\", ref: \"sushi\", schema_version: \"1.3\", updated_at: 1773412360) as rahul",
    "invoke Intelligence.GetCategoryRef(actor_id: rahul, category: \"FOOD\") as X",
    "invoke Intelligence.GetVersion(actor_id: rahul) as X",

    # --- GetIntelligenceObject ---
    "invoke Intelligence.GetIntelligenceObject(actor_id: rahul) as X",
    "invoke Intelligence.GetIntelligenceObject(actor_id: robert) as X",

    # --- CreateSessionRequest ---
    "invoke Intelligence.CreateSessionRequest(session_id: \"sess1\", agent_id: \"agent007\", purpose: \"food_ordering\", approved_categories: []String{\"FOOD\"}, approved_scopes: []String{\"read\"}, requested_uses: 5, ttl_seconds: 3600, approval_ref: \"ref001\") as rahul",

    # --- GetSession (after create, should be REQUESTED) ---
    "invoke Intelligence.GetSession(actor_id: rahul, session_id: \"sess1\") as X",

    # --- CreateSessionRequest duplicate (should fail) ---
    "invoke Intelligence.CreateSessionRequest(session_id: \"sess1\", agent_id: \"agent099\", purpose: \"duplicate\", approved_categories: []String{\"FOOD\"}, approved_scopes: []String{\"read\"}, requested_uses: 1, ttl_seconds: 100, approval_ref: \"dup\") as rahul",

    # --- ApproveSession ---
    "invoke Intelligence.ApproveSession(session_id: \"sess1\", issued_at: 1773412400, expires_at: 1773416000, remaining_uses: 5, approval_ref: \"ref001\") as rahul",

    # --- GetSession (after approve, should be ACTIVE) ---
    "invoke Intelligence.GetSession(actor_id: rahul, session_id: \"sess1\") as X",

    # --- ValidateSession (should be valid) ---
    "invoke Intelligence.ValidateSession(actor_id: rahul, session_id: \"sess1\", agent_id: \"agent007\", required_categories: []String{\"FOOD\"}, required_scopes: []String{\"read\"}, current_time: 1773412500) as X",

    # --- ConsumeSessionUse ---
    "invoke Intelligence.ConsumeSessionUse(session_id: \"sess1\", current_time: 1773412500) as rahul",

    # --- GetSession (after consume, remaining_uses should decrease) ---
    "invoke Intelligence.GetSession(actor_id: rahul, session_id: \"sess1\") as X",

    # --- RevokeSession ---
    "invoke Intelligence.RevokeSession(session_id: \"sess1\", revocation_reason: \"no longer needed\") as rahul",

    # --- GetSession (after revoke, should be REVOKED) ---
    "invoke Intelligence.GetSession(actor_id: rahul, session_id: \"sess1\") as X",

    # --- DenySession: create a second session and deny it ---
    "invoke Intelligence.CreateSessionRequest(session_id: \"sess2\", agent_id: \"agent008\", purpose: \"health_check\", approved_categories: []String{\"HEALTH\"}, approved_scopes: []String{\"read\"}, requested_uses: 3, ttl_seconds: 1800, approval_ref: \"ref002\") as rahul",
    "invoke Intelligence.DenySession(session_id: \"sess2\", denial_reason: \"not authorized\") as rahul",

    # --- GetSession (after deny, should be DENIED) ---
    "invoke Intelligence.GetSession(actor_id: rahul, session_id: \"sess2\") as X",
]

# run scripts with with script name e.g. "coco nut run test"
[scripts]
build = "coco compile"
clean = "rm -rf ./build"
test = '''
PASS=0
FAIL=0
TEST_RESULTS=$(coco lab run test-intelligence 2>&1)

# --- GetCategoryRef ---
echo "$TEST_RESULTS" | grep -q 'cat_ref:map\[Category:FOOD Exists:true LastUpdated:1773412350 Ref:fish SchemaVersion:1.1\]' && { echo 'PASS: GetCategoryRef rahul FOOD'; PASS=$((PASS+1)); } || { echo 'FAIL: GetCategoryRef rahul FOOD'; FAIL=$((FAIL+1)); }

echo "$TEST_RESULTS" | grep -q 'cat_ref:map\[Category:ADDRESS Exists:true LastUpdated:1773412351 Ref:home SchemaVersion:1.1\]' && { echo 'PASS: GetCategoryRef rahul ADDRESS'; PASS=$((PASS+1)); } || { echo 'FAIL: GetCategoryRef rahul ADDRESS'; FAIL=$((FAIL+1)); }

echo "$TEST_RESULTS" | grep -q 'cat_ref:map\[Category:FOOD Exists:true LastUpdated:1773412351 Ref:milk SchemaVersion:1.2\]' && { echo 'PASS: GetCategoryRef robert FOOD'; PASS=$((PASS+1)); } || { echo 'FAIL: GetCategoryRef robert FOOD'; FAIL=$((FAIL+1)); }

# --- ListCategoryRefs ---
echo "$TEST_RESULTS" | grep -q 'result:\[.*Ref:fish.*Ref:vitals.*Ref:home.*Ref:card' && { echo 'PASS: ListCategoryRefs rahul'; PASS=$((PASS+1)); } || { echo 'FAIL: ListCategoryRefs rahul'; FAIL=$((FAIL+1)); }

echo "$TEST_RESULTS" | grep -q 'result:\[.*Ref:milk.*Ref:records.*Ref:office.*Ref:bank' && { echo 'PASS: ListCategoryRefs robert'; PASS=$((PASS+1)); } || { echo 'FAIL: ListCategoryRefs robert'; FAIL=$((FAIL+1)); }

# --- RemoveCategoryRef ---
echo "$TEST_RESULTS" | grep -q 'cat_ref:map\[Category:ADDRESS Exists:false LastUpdated:1773412352 Ref:\[\] SchemaVersion:\[\]\]' && { echo 'PASS: RemoveCategoryRef rahul ADDRESS'; PASS=$((PASS+1)); } || { echo 'FAIL: RemoveCategoryRef rahul ADDRESS'; FAIL=$((FAIL+1)); }

# --- GetVersion ---
echo "$TEST_RESULTS" | grep -q 'ver:5' && { echo 'PASS: GetVersion rahul'; PASS=$((PASS+1)); } || { echo 'FAIL: GetVersion rahul'; FAIL=$((FAIL+1)); }

echo "$TEST_RESULTS" | grep -q 'ver:4' && { echo 'PASS: GetVersion robert'; PASS=$((PASS+1)); } || { echo 'FAIL: GetVersion robert'; FAIL=$((FAIL+1)); }

# --- GetLastUpdatedAt ---
echo "$TEST_RESULTS" | grep -q 'last_updated:1773412352' && { echo 'PASS: GetLastUpdatedAt rahul'; PASS=$((PASS+1)); } || { echo 'FAIL: GetLastUpdatedAt rahul'; FAIL=$((FAIL+1)); }

echo "$TEST_RESULTS" | grep -q 'last_updated:1773412351' && { echo 'PASS: GetLastUpdatedAt robert'; PASS=$((PASS+1)); } || { echo 'FAIL: GetLastUpdatedAt robert'; FAIL=$((FAIL+1)); }

# --- SetCategoryRef overwrite ---
echo "$TEST_RESULTS" | grep -q 'cat_ref:map\[Category:FOOD Exists:true LastUpdated:1773412360 Ref:sushi SchemaVersion:1.3\]' && { echo 'PASS: SetCategoryRef overwrite rahul FOOD'; PASS=$((PASS+1)); } || { echo 'FAIL: SetCategoryRef overwrite rahul FOOD'; FAIL=$((FAIL+1)); }

echo "$TEST_RESULTS" | grep -q 'ver:6' && { echo 'PASS: GetVersion rahul after overwrite'; PASS=$((PASS+1)); } || { echo 'FAIL: GetVersion rahul after overwrite'; FAIL=$((FAIL+1)); }

# --- GetIntelligenceObject ---
echo "$TEST_RESULTS" | grep -q 'intel_obj:.*Ref:sushi.*Ref:vitals.*Ref:card.*Version:6' && { echo 'PASS: GetIntelligenceObject rahul'; PASS=$((PASS+1)); } || { echo 'FAIL: GetIntelligenceObject rahul'; FAIL=$((FAIL+1)); }

echo "$TEST_RESULTS" | grep -q 'intel_obj:.*Ref:milk.*Ref:records.*Ref:office.*Ref:bank.*Version:4' && { echo 'PASS: GetIntelligenceObject robert'; PASS=$((PASS+1)); } || { echo 'FAIL: GetIntelligenceObject robert'; FAIL=$((FAIL+1)); }

# --- CreateSessionRequest + GetSession (REQUESTED) ---
echo "$TEST_RESULTS" | grep -q 'SessionId:sess1 Status:REQUESTED' && { echo 'PASS: CreateSessionRequest + GetSession REQUESTED'; PASS=$((PASS+1)); } || { echo 'FAIL: CreateSessionRequest + GetSession REQUESTED'; FAIL=$((FAIL+1)); }

# --- CreateSessionRequest duplicate (should fail) ---
echo "$TEST_RESULTS" | grep -q 'Session already exists with this ID' && { echo 'PASS: CreateSessionRequest duplicate rejected'; PASS=$((PASS+1)); } || { echo 'FAIL: CreateSessionRequest duplicate rejected'; FAIL=$((FAIL+1)); }

# --- ApproveSession + GetSession (ACTIVE) ---
echo "$TEST_RESULTS" | grep -q 'RemainingUses:5.*SessionId:sess1 Status:ACTIVE' && { echo 'PASS: ApproveSession + GetSession ACTIVE'; PASS=$((PASS+1)); } || { echo 'FAIL: ApproveSession + GetSession ACTIVE'; FAIL=$((FAIL+1)); }

# --- ValidateSession ---
echo "$TEST_RESULTS" | grep -q 'result:map\[Reason:valid Valid:true\]' && { echo 'PASS: ValidateSession valid'; PASS=$((PASS+1)); } || { echo 'FAIL: ValidateSession valid'; FAIL=$((FAIL+1)); }

# --- ConsumeSessionUse + GetSession (remaining decreased) ---
echo "$TEST_RESULTS" | grep -q 'RemainingUses:4.*SessionId:sess1 Status:ACTIVE' && { echo 'PASS: ConsumeSessionUse + GetSession remaining=4'; PASS=$((PASS+1)); } || { echo 'FAIL: ConsumeSessionUse + GetSession remaining=4'; FAIL=$((FAIL+1)); }

# --- RevokeSession + GetSession (REVOKED) ---
echo "$TEST_RESULTS" | grep -q 'RevocationReason:no longer needed SessionId:sess1 Status:REVOKED' && { echo 'PASS: RevokeSession + GetSession REVOKED'; PASS=$((PASS+1)); } || { echo 'FAIL: RevokeSession + GetSession REVOKED'; FAIL=$((FAIL+1)); }

# --- DenySession + GetSession (DENIED) ---
echo "$TEST_RESULTS" | grep -q 'RevocationReason:not authorized SessionId:sess2 Status:DENIED' && { echo 'PASS: DenySession + GetSession DENIED'; PASS=$((PASS+1)); } || { echo 'FAIL: DenySession + GetSession DENIED'; FAIL=$((FAIL+1)); }

echo ""
echo "Results: $PASS passed, $FAIL failed out of $((PASS+FAIL)) tests"
if [ "$FAIL" -gt 0 ]; then exit 1; fi
'''
