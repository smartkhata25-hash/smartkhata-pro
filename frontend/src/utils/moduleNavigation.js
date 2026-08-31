import { canAccess } from './permissionHelper';
import { isModuleEnabled, MODULE_KEYS, normalizeModuleConfig } from './moduleConfig';

const canShowByModule = (entry, user) => {
  if (!entry?.module) return true;

  return isModuleEnabled(user, entry.module);
};

const canShowByAccess = (entry, user) => {
  if (!entry) return false;

  return canAccess({
    permission: entry.permission || null,
    anyPermissions: entry.anyPermissions || [],
    allPermissions: entry.allPermissions || [],
    ownerOnly: Boolean(entry.ownerOnly),
    systemAdminOnly: Boolean(entry.systemAdminOnly),
    moduleKey: entry.module || null,
    user,
  });
};

export const filterMenuConfigByModules = (menus = [], user = null) => {
  return menus
    .filter((menu) => canShowByModule(menu, user) && canShowByAccess(menu, user))
    .map((menu) => {
      if (!Array.isArray(menu.sections)) {
        return menu;
      }

      const sections = menu.sections
        .filter((section) => canShowByModule(section, user) && canShowByAccess(section, user))
        .map((section) => ({
          ...section,
          items: (section.items || []).filter(
            (item) => canShowByModule(item, user) && canShowByAccess(item, user)
          ),
        }))
        .filter((section) => !section.items || section.items.length > 0);

      return {
        ...menu,
        sections,
      };
    })
    .filter((menu) => menu.path || !menu.sections || menu.sections.length > 0);
};

export const getDefaultWorkspacePath = (user = null) => {
  if (!user) {
    return '/dashboard';
  }

  const moduleConfig = normalizeModuleConfig(user);

  if (
    moduleConfig.defaultModule === MODULE_KEYS.TRAVEL &&
    canAccess({
      permission: 'travel.view',
      moduleKey: MODULE_KEYS.TRAVEL,
      user,
    })
  ) {
    return '/travel/dashboard';
  }

  return '/dashboard';
};
