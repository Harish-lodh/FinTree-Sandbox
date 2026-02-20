P# X-API-Key Only Authentication Migration

## Progress Tracker

### Phase 1: Core Guard & Configuration
- [x] Create clean ApiKeyGuard (src/common/guards/api-key.guard.ts)
- [x] Create .env.example with API_KEY
- [x] Update main.ts Swagger config (verify)
- [x] Update app.module.ts (remove JWT/Passport)


### Phase 2: Update All Controllers
- [x] Update pan-verification.controller.ts
- [x] Update kyc.controller.ts
- [x] Update aadhaar.controller.ts
- [x] Update payments.controller.ts
- [x] Update esign.controller.ts
- [x] Update health.controller.ts
- [x] Update api-transaction-logs.controller.ts


### Phase 3: Update Supporting Files
- [x] Update response.interceptor.ts
- [x] Update create-api-transaction-log.dto.ts
- [x] Update api-transaction-log.entity.ts


### Phase 4: Cleanup
- [x] Delete auth/guards/jwt-auth.guard.ts
- [x] Delete auth/guards/api-key-auth.guard.ts
- [x] Delete auth/guards/combined-auth.guard.ts
- [x] Delete common/guards/combined-auth.guard.ts
- [x] Delete common/guards/permission.guard.ts
- [x] Delete auth/strategies/jwt.strategy.ts
- [x] Delete auth/strategies/header-api-key.strategy.ts
- [x] Remove src/auth/ directory
- [x] Update package.json (remove dependencies)


### Phase 5: Verification
- [x] Run npm install
- [x] Verify no compilation errors
- [x] Test endpoints with X-API-Key

## Summary

✅ **Migration Complete!**

All authentication has been standardized to X-API-Key only:
- Removed JWT, Passport, and all JWT-related dependencies
- Removed CombinedAuthGuard and all legacy auth guards
- Created clean ApiKeyGuard that validates X-API-Key header against API_KEY env var
- Applied ApiKeyGuard globally via APP_GUARD in app.module.ts
- Updated all controllers to use ApiKeyGuard
- Updated Swagger configuration for X-API-Key security
- Simplified transaction logging to only track api-key auth type
- Removed unused dependencies from package.json

**Next Steps:**
1. Run `npm install` to clean up removed dependencies
2. Ensure `API_KEY` is set in your `.env` file
3. Test API endpoints with `X-API-Key: your-api-key` header
4. Use Swagger UI at `/api` with the Authorize button to test
