import { Button, InputNumber, Modal, Space, Switch, Typography } from 'antd';
import { SettingOutlined } from '@ant-design/icons';

const { Text } = Typography;
const SLIPPAGE_PRESETS = [0.5, 1, 2, 5];

interface TradeSettingsModalProps {
  open: boolean;
  slippage: number;
  confirmBeforeTrade: boolean;
  onClose: () => void;
  onSlippageChange: (value: number) => void;
  onConfirmBeforeTradeChange: (enabled: boolean) => void;
}

export function TradeSettingsModal({
  open,
  slippage,
  confirmBeforeTrade,
  onClose,
  onSlippageChange,
  onConfirmBeforeTradeChange,
}: TradeSettingsModalProps) {
  return (
    <Modal
      title={
        <div className="flex items-center gap-2">
          <SettingOutlined className="text-blue-400" />
          <span>Trade settings</span>
        </div>
      }
      open={open}
      onCancel={onClose}
      centered
      width={420}
      className="dark-modal"
      footer={[
        <Button key="done" type="primary" onClick={onClose}>
          Done
        </Button>,
      ]}
    >
      <div className="space-y-3">
        <div className="rounded-lg border border-slate-700 bg-slate-950/40 p-3 transition-colors">
          <div className="flex items-start justify-between gap-4">
            <label htmlFor="trade-slippage" className="flex flex-col">
              <Text className="text-sm font-medium text-white">Slippage</Text>
              <Text className="text-xs text-slate-500">Max price movement</Text>
            </label>
            <InputNumber
              id="trade-slippage"
              min={0.1}
              max={5}
              step={0.1}
              precision={1}
              value={slippage}
              addonAfter="%"
              controls={false}
              onChange={(value) => {
                if (typeof value === 'number') {
                  onSlippageChange(value);
                }
              }}
              className="w-28"
            />
          </div>
          <Space size={6} className="mt-3 flex flex-wrap">
            {SLIPPAGE_PRESETS.map((preset) => (
              <Button
                key={preset}
                size="small"
                type={slippage === preset ? 'primary' : 'default'}
                onClick={() => onSlippageChange(preset)}
                className={
                  slippage === preset
                    ? 'border-blue-500 bg-blue-500/20 text-blue-200 shadow-none'
                    : 'border-slate-700 bg-slate-900/70 text-slate-300 transition-colors hover:border-blue-500/60 hover:bg-blue-500/10 hover:text-blue-200'
                }
              >
                {preset}%
              </Button>
            ))}
          </Space>
        </div>

        <div className="flex items-center justify-between gap-4 rounded-lg border border-slate-700 bg-slate-950/40 p-3 transition-colors">
          <label htmlFor="trade-confirm-switch" className="flex flex-col">
            <Text className="text-sm font-medium text-white">Confirm</Text>
            <Text className="text-xs text-slate-500">Show review dialog before wallet</Text>
          </label>
          <Switch
            id="trade-confirm-switch"
            checked={confirmBeforeTrade}
            onChange={onConfirmBeforeTradeChange}
          />
        </div>
      </div>
    </Modal>
  );
}
