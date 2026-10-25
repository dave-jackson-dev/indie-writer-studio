import { DialogUtility } from '@syncfusion/ej2-angular-popups';

/** Asks the author to confirm; resolves to true only if she presses the confirming button. */
export function confirmDialog(
  title: string,
  content: string,
  confirmText: string,
): Promise<boolean> {
  return new Promise((resolve) => {
    let answered = false;
    const answer = (value: boolean): void => {
      if (answered) return;
      answered = true;
      dialog.hide();
      resolve(value);
    };
    const dialog = DialogUtility.confirm({
      title,
      content,
      okButton: { text: confirmText, click: () => answer(true) },
      cancelButton: { text: 'Cancel', click: () => answer(false) },
      closeOnEscape: true,
      showCloseIcon: true,
      position: { X: 'center', Y: 'center' },
      close: () => answer(false),
    });
  });
}
