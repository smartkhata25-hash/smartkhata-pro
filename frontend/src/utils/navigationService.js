// 🌍 GLOBAL NAVIGATION SERVICE (PRO LEVEL)

let historyStack = [];

export const navigationService = {
  // ➕ Add new route
  push(path) {
    if (!path) return;

    const last = historyStack[historyStack.length - 1];

    // duplicate avoid
    if (last !== path) {
      historyStack.push(path);
    }

    // limit stack (memory safe)
    if (historyStack.length > 50) {
      historyStack.shift();
    }
  },

  // 🔙 Go Back
  goBack(navigate) {
    if (historyStack.length > 1) {
      historyStack.pop(); // current remove
      const prev = historyStack.pop(); // previous

      navigate(prev || '/dashboard');
    } else {
      navigate('/dashboard');
    }
  },

  // ❓ Check if back available
  canGoBack() {
    return historyStack.length > 1;
  },

  // 🧹 Reset (optional)
  reset() {
    historyStack = [];
  },
};
