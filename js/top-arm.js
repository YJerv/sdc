/**
 * A face click changes the top view only after Set top has been pressed,
 * and that choice is used up by the next successful selection.
 */
export function createTopArm() {
  let armed = false;
  return {
    arm() {
      armed = true;
    },
    cancel() {
      armed = false;
    },
    isArmed() {
      return armed;
    },
    /** Returns whether this click may reorient the part. */
    click() {
      if (!armed) return false;
      armed = false;
      return true;
    },
  };
}
