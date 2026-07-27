#![no_std]
use soroban_sdk::{
    contract, contractimpl, contracttype, contracterror, token, Address, Env, String
};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[contracttype]
pub enum DisputeStatus {
    Open = 0,
    Resolved = 1,
}

#[derive(Clone, Debug, PartialEq, Eq)]
#[contracttype]
pub struct Dispute {
    pub id: u32,
    pub title: String,
    pub description: String,
    pub end_time: u64,
    pub votes_for: i128,
    pub votes_against: i128,
    pub status: DisputeStatus,
    pub disputed_amount: i128,
    pub winner_address: Address,
    pub loser_address: Address,
}

#[derive(Clone, Debug, PartialEq, Eq)]
#[contracttype]
pub enum DataKey {
    Token,
    DisputeCount,
    Dispute(u32),
    Stake(Address, u32), // User's stake on a specific dispute
    VoteSupport(Address, u32), // User's vote choice (true = for, false = against)
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[contracterror]
pub enum Error {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    DisputeNotFound = 3,
    DisputeClosed = 4,
    DisputeNotClosed = 5,
    VotingEnded = 6,
    VotingNotEnded = 7,
    ZeroAmount = 8,
    AlreadyVoted = 9,
    NoStake = 10,
    DisputeNotResolved = 11,
}

#[contract]
pub struct DisputeContract;

#[contractimpl]
impl DisputeContract {
    pub fn initialize(env: Env, token: Address) -> Result<(), Error> {
        if env.storage().instance().has(&DataKey::Token) {
            return Err(Error::AlreadyInitialized);
        }
        env.storage().instance().set(&DataKey::Token, &token);
        env.storage().instance().set(&DataKey::DisputeCount, &0u32);
        Ok(())
    }

    pub fn create_dispute(
        env: Env,
        title: String,
        description: String,
        duration: u64,
        disputed_amount: i128,
        winner_address: Address,
        loser_address: Address,
    ) -> Result<u32, Error> {
        let caller = env.caller();
        caller.require_auth();

        if !env.storage().instance().has(&DataKey::Token) {
            return Err(Error::NotInitialized);
        }

        if disputed_amount <= 0 {
            return Err(Error::ZeroAmount);
        }

        let token_address: Address = env
            .storage()
            .instance()
            .get(&DataKey::Token)
            .ok_or(Error::NotInitialized)?;

        let token_client = token::Client::new(&env, &token_address);
        token_client.transfer(&caller, &env.current_contract_address(), &disputed_amount);

        let dispute_id: u32 = env.storage().instance().get(&DataKey::DisputeCount).unwrap_or(0);
        let current_time = env.ledger().timestamp();
        
        let dispute = Dispute {
            id: dispute_id,
            title,
            description,
            end_time: current_time + duration,
            votes_for: 0,
            votes_against: 0,
            status: DisputeStatus::Open,
            disputed_amount,
            winner_address,
            loser_address,
        };

        env.storage().instance().set(&DataKey::Dispute(dispute_id), &dispute);
        env.storage().instance().set(&DataKey::DisputeCount, &(dispute_id + 1));

        Ok(dispute_id)
    }

    pub fn vote(
        env: Env,
        voter: Address,
        dispute_id: u32,
        amount: i128,
        support: bool,
    ) -> Result<(), Error> {
        voter.require_auth();

        if amount <= 0 {
            return Err(Error::ZeroAmount);
        }

        let mut dispute: Dispute = env
            .storage()
            .instance()
            .get(&DataKey::Dispute(dispute_id))
            .ok_or(Error::DisputeNotFound)?;

        if dispute.status != DisputeStatus::Open {
            return Err(Error::DisputeClosed);
        }

        if env.ledger().timestamp() >= dispute.end_time {
            return Err(Error::VotingEnded);
        }

        let stake_key = DataKey::Stake(voter.clone(), dispute_id);
        if env.storage().instance().has(&stake_key) {
            return Err(Error::AlreadyVoted); // Simplification: one vote per address
        }

        let token_address: Address = env
            .storage()
            .instance()
            .get(&DataKey::Token)
            .ok_or(Error::NotInitialized)?;
        
        let token_client = token::Client::new(&env, &token_address);
        token_client.transfer(&voter, &env.current_contract_address(), &amount);

        env.storage().instance().set(&stake_key, &amount);
        env.storage().instance().set(&DataKey::VoteSupport(voter.clone(), dispute_id), &support);

        if support {
            dispute.votes_for += amount;
        } else {
            dispute.votes_against += amount;
        }

        env.storage().instance().set(&DataKey::Dispute(dispute_id), &dispute);

        Ok(())
    }

    pub fn resolve(env: Env, dispute_id: u32) -> Result<bool, Error> {
        let mut dispute: Dispute = env
            .storage()
            .instance()
            .get(&DataKey::Dispute(dispute_id))
            .ok_or(Error::DisputeNotFound)?;

        if dispute.status != DisputeStatus::Open {
            return Err(Error::DisputeClosed);
        }

        if env.ledger().timestamp() < dispute.end_time {
            return Err(Error::VotingNotEnded);
        }

        let is_in_favor = dispute.votes_for > dispute.votes_against;
        dispute.status = DisputeStatus::Resolved;

        let token_address: Address = env
            .storage()
            .instance()
            .get(&DataKey::Token)
            .ok_or(Error::NotInitialized)?;

        let token_client = token::Client::new(&env, &token_address);

        if is_in_favor {
            token_client.transfer(&env.current_contract_address(), &dispute.winner_address, &dispute.disputed_amount);
        } else {
            token_client.transfer(&env.current_contract_address(), &dispute.loser_address, &dispute.disputed_amount);
        }

        env.storage().instance().set(&DataKey::Dispute(dispute_id), &dispute);

        Ok(is_in_favor)
    }

    pub fn claim_stake(env: Env, voter: Address, dispute_id: u32) -> Result<(), Error> {
        voter.require_auth();

        let dispute: Dispute = env
            .storage()
            .instance()
            .get(&DataKey::Dispute(dispute_id))
            .ok_or(Error::DisputeNotFound)?;

        if dispute.status != DisputeStatus::Resolved {
            return Err(Error::DisputeNotResolved);
        }

        let stake_key = DataKey::Stake(voter.clone(), dispute_id);
        let amount: i128 = env.storage().instance().get(&stake_key).unwrap_or(0);

        if amount == 0 {
            return Err(Error::NoStake);
        }

        // Return the stake back to the voter
        let token_address: Address = env
            .storage()
            .instance()
            .get(&DataKey::Token)
            .ok_or(Error::NotInitialized)?;
        
        let token_client = token::Client::new(&env, &token_address);
        token_client.transfer(&env.current_contract_address(), &voter, &amount);

        // Remove stake to prevent double claiming
        env.storage().instance().remove(&stake_key);

        Ok(())
    }

    // Getters
    pub fn get_dispute(env: Env, dispute_id: u32) -> Result<Dispute, Error> {
        env.storage().instance().get(&DataKey::Dispute(dispute_id)).ok_or(Error::DisputeNotFound)
    }

    pub fn get_dispute_count(env: Env) -> u32 {
        env.storage().instance().get(&DataKey::DisputeCount).unwrap_or(0)
    }
}

mod test;
