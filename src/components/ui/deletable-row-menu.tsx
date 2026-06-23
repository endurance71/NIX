import { PropsWithChildren } from 'react';
import { MenuView } from '@expo/ui/community/menu';

type DeletableRowMenuProps = PropsWithChildren<{
  deleteLabel: string;
  onDelete: () => void;
  disabled?: boolean;
}>;

export function DeletableRowMenu({ children, deleteLabel, onDelete, disabled }: DeletableRowMenuProps) {
  if (disabled) {
    return <>{children}</>;
  }

  return (
    <MenuView
      shouldOpenOnLongPress
      actions={[
        {
          id: 'delete',
          title: deleteLabel,
          attributes: { destructive: true },
        },
      ]}
      onPressAction={(event) => {
        if (event.nativeEvent.event === 'delete') {
          onDelete();
        }
      }}>
      {children}
    </MenuView>
  );
}
