import { useCallback, useMemo, forwardRef, useImperativeHandle, useRef } from 'react';
import { View, Text, Pressable } from 'react-native';
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetScrollView,
  type BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet';
import { X } from 'lucide-react-native';

export interface ModalRef {
  open: () => void;
  close: () => void;
}

interface ModalProps {
  title?: string;
  children: React.ReactNode;
  snapPoints?: (string | number)[];
  onClose?: () => void;
  enableDynamicSizing?: boolean;
}

export const Modal = forwardRef<ModalRef, ModalProps>(
  ({ title, children, snapPoints: customSnapPoints, onClose, enableDynamicSizing }, ref) => {
    const bottomSheetRef = useRef<BottomSheet>(null);
    const snapPoints = useMemo(
      () => customSnapPoints || ['50%', '90%'],
      [customSnapPoints]
    );

    useImperativeHandle(ref, () => ({
      open: () => bottomSheetRef.current?.snapToIndex(0),
      close: () => bottomSheetRef.current?.close(),
    }));

    const renderBackdrop = useCallback(
      (props: BottomSheetBackdropProps) => (
        <BottomSheetBackdrop
          {...props}
          disappearsOnIndex={-1}
          appearsOnIndex={0}
          opacity={0.6}
        />
      ),
      []
    );

    const handleClose = useCallback(() => {
      onClose?.();
    }, [onClose]);

    return (
      <BottomSheet
        ref={bottomSheetRef}
        index={-1}
        snapPoints={enableDynamicSizing ? undefined : snapPoints}
        enableDynamicSizing={enableDynamicSizing}
        enablePanDownToClose
        backdropComponent={renderBackdrop}
        onClose={handleClose}
        backgroundStyle={{ backgroundColor: '#18181b' }}
        handleIndicatorStyle={{ backgroundColor: '#52525b' }}
      >
        {title && (
          <View className="flex-row items-center justify-between px-4 pb-3 border-b border-zinc-800">
            <Text className="text-zinc-100 text-lg font-bold">{title}</Text>
            <Pressable
              onPress={() => bottomSheetRef.current?.close()}
              className="p-1"
            >
              <X size={20} color="#a1a1aa" />
            </Pressable>
          </View>
        )}
        <BottomSheetScrollView
          contentContainerStyle={{ padding: 16 }}
        >
          {children}
        </BottomSheetScrollView>
      </BottomSheet>
    );
  }
);

Modal.displayName = 'Modal';
