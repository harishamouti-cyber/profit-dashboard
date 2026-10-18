import { Link } from "react-router";
import { Icon } from "./ui";

export function UpgradeCard({
  feature,
  required = "Growth",
}: {
  feature: string;
  required?: string;
}) {
  return (
    <div className="pd-upgrade">
      <div className="t">
        <span className="pd-ico"><Icon name="lock" size={15} /></span>
        <div>
          <b>Unlock with {required}</b>
          <p>{feature}</p>
        </div>
      </div>
      <Link to="/app/billing" className="pd-btn primary sm">
        <Icon name="sparkle" size={13} />See plans
      </Link>
    </div>
  );
}
