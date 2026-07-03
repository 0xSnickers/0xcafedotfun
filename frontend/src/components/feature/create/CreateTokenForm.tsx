'use client';

import { Form, Input, Button } from 'antd';
import type { FormInstance } from 'antd';
import {
  RocketOutlined,
  StarOutlined,
  InfoCircleOutlined,
  DollarCircleOutlined,
  FireOutlined,
} from '@ant-design/icons';
import { CONTRACT_CONSTANTS } from '@/config/contracts';
import { VanityMiningPanel } from '@/components/feature/create/VanityMiningPanel';
import type { TokenForm, VanityProgress, VanityResult } from '@/hooks/useVanityTokenGeneration';

const { TextArea } = Input;
const MAX_TOKEN_NAME_LENGTH = 64;
const MAX_TOKEN_SYMBOL_LENGTH = 16;
const MAX_TOKEN_IMAGE_LENGTH = 256;
const MAX_TOKEN_DESCRIPTION_LENGTH = 500;

interface CreateTokenFormProps {
  form: FormInstance<TokenForm>;
  onFinish: (values: TokenForm) => void | Promise<void>;
  onValuesChange: (_: Partial<TokenForm>, values: TokenForm) => void;
  disabled: boolean;
  isCreating: boolean;
  isGeneratingVanity: boolean;
  txLoading: boolean;
  vanityResult: VanityResult | null;
  vanityProgress: VanityProgress | null;
  creationFee: string;
  isConnected: boolean;
  networkName: string;
}

export function CreateTokenForm({
  form,
  onFinish,
  onValuesChange,
  disabled,
  isCreating,
  isGeneratingVanity,
  txLoading,
  vanityResult,
  vanityProgress,
  creationFee,
  isConnected,
  networkName,
}: CreateTokenFormProps) {
  return (
    <Form
      form={form}
      layout="vertical"
      onFinish={onFinish}
      disabled={disabled}
      onValuesChange={onValuesChange}
    >
      <div className="create-workspace">
        <section className="create-form-panel">
          <div className="create-panel-title">
            <FireOutlined />
            <span>Token details</span>
            <small>01</small>
          </div>
          <div className="create-form-grid">
            <div>
              <Form.Item
                label="Name"
                name="name"
                rules={[
                  { required: true, message: 'Enter a token name' },
                  { max: MAX_TOKEN_NAME_LENGTH, message: `Name must be ${MAX_TOKEN_NAME_LENGTH} characters or fewer` },
                ]}
              >
                <Input placeholder="Pepe Meme" maxLength={MAX_TOKEN_NAME_LENGTH} showCount />
              </Form.Item>
            </div>

            <div>
              <Form.Item
                label="Symbol"
                name="symbol"
                rules={[
                  { required: true, message: 'Enter a token symbol' },
                  { max: MAX_TOKEN_SYMBOL_LENGTH, message: `Symbol must be ${MAX_TOKEN_SYMBOL_LENGTH} characters or fewer` },
                ]}
              >
                <Input placeholder="PEPE" maxLength={MAX_TOKEN_SYMBOL_LENGTH} showCount />
              </Form.Item>
            </div>
          </div>

          <Form.Item
            label="Description"
            name="description"
            rules={[
              { required: true, message: 'Enter a token description' },
              { max: MAX_TOKEN_DESCRIPTION_LENGTH, message: `Description must be ${MAX_TOKEN_DESCRIPTION_LENGTH} characters or fewer` },
            ]}
          >
            <TextArea
              rows={4}
              placeholder="What makes this token memorable?"
              maxLength={MAX_TOKEN_DESCRIPTION_LENGTH}
              showCount
            />
          </Form.Item>

          <Form.Item
            label="Image URL"
            name="tokenImage"
            className="!mb-0"
            rules={[
              { max: MAX_TOKEN_IMAGE_LENGTH, message: `Image URL must be ${MAX_TOKEN_IMAGE_LENGTH} characters or fewer` },
            ]}
          >
            <Input
              placeholder="https://..."
              prefix={<InfoCircleOutlined className="text-slate-400" />}
              maxLength={MAX_TOKEN_IMAGE_LENGTH}
              showCount
            />
          </Form.Item>
        </section>

        <aside className="create-launch-panel">
          <div className="create-panel-title">
            <StarOutlined />
            <span>Launch settings</span>
            <small>02</small>
          </div>

          <div className="create-metrics">
            <div><span>Initial price</span><strong>{CONTRACT_CONSTANTS.DEFAULT_INITIAL_PRICE} ETH</strong></div>
            <div><span>Launch cap</span><strong>{CONTRACT_CONSTANTS.TARGET_MARKET_CAP} ETH</strong></div>
            <div><span>Platform fee</span><strong>1%</strong></div>
            <div><span>Creator share</span><strong>0.25%</strong></div>
          </div>

          <VanityMiningPanel
            isGeneratingVanity={isGeneratingVanity}
            vanityProgress={vanityProgress}
            vanityResult={vanityResult}
          />

          <div className="create-network-row">
            <span><i className={isConnected ? 'is-online' : ''} /> Network</span>
            <strong>{networkName}</strong>
          </div>

          <div className="create-submit-row">
            <div>
              <DollarCircleOutlined />
              <span>Fee</span>
              <strong>{creationFee === '0' ? 'Free + Gas' : `${creationFee} ETH + Gas`}</strong>
            </div>
            <Button
              type="primary"
              size="large"
              htmlType="submit"
              loading={isCreating || txLoading}
              disabled={isCreating || txLoading}
              className="create-submit-button"
            >
              <RocketOutlined />
              {txLoading
                ? 'Confirming...'
                : isGeneratingVanity
                  ? 'Predicting address...'
                  : isCreating
                    ? 'Creating...'
                    : 'Create token'}
            </Button>
          </div>
        </aside>
      </div>
    </Form>
  );
}
