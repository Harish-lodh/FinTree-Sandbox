import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('api_transaction_logs')
@Index(['callerId'])
@Index(['service'])
@Index(['status'])
@Index(['createdAt'])
export class ApiTransactionLog {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({
    type: 'varchar',
    length: 20,
    name: 'auth_type',
    default: 'api-key',
  })
  authType: string;


  @Column({
    type: 'varchar',
    length: 255,
    name: 'caller_id',
  })
  callerId: string;

  @Column({
    type: 'varchar',
    length: 100,
  })
  service: string;

  @Column({
    type: 'varchar',
    length: 255,
  })
  endpoint: string;

  @Column({
    type: 'text',
    name: 'request_payload',
    nullable: true,
  })
  requestPayload: string;

  @Column({
    type: 'text',
    name: 'response_data',
    nullable: true,
  })
  responseData: string;

  @Column({
    type: 'enum',
    enum: ['success', 'error', 'pending'],
    default: 'pending',
  })
  status: 'success' | 'error' | 'pending';

  @Column({
    type: 'int',
    name: 'duration_ms',
    nullable: true,
  })
  durationMs: number;

  @CreateDateColumn({
    name: 'created_at',
  })
  createdAt: Date;
}
