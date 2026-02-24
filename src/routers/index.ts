import authRouter from "../modules/auth/auth.router.ts";
import billingRouter from "../modules/billing/billing.router.ts";
import customerRouter from "../modules/customer/customer.router.ts";
import inspectionRouter from "../modules/inspection/inspection.router.ts";
import invoiceRouter from "../modules/invoice/invoice.router.ts";
import loanRouter from "../modules/loan/loan.router.ts";
import materialRouter from "../modules/material/material.router.ts";
import organizationRouter from "../modules/organization/organization.router.ts";
import packageRouter from "../modules/package/package.router.ts";
import requestRouter from "../modules/request/request.router.ts";
import rolesRouter from "../modules/roles/roles.router.ts";
import subscriptionTypeRouter from "../modules/subscription_type/subscription_type.router.ts";
import userRouter from "../modules/user/user.router.ts";
import { adminRouter } from "../modules/super_admin/super_admin.router.ts";

export {
  authRouter,
  billingRouter,
  customerRouter,
  inspectionRouter,
  invoiceRouter,
  loanRouter,
  materialRouter,
  organizationRouter,
  packageRouter,
  requestRouter,
  rolesRouter,
  subscriptionTypeRouter,
  userRouter,
  adminRouter,
};
