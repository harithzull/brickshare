// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title RealEstateTokenization
 * @dev A simple real estate tokenization smart contract where an admin can list properties,
 * and investors can buy or transfer fractional ownership tokens.
 */
contract RealEstateTokenization {

    address public owner;
    uint256 public propertyCount;

    struct Property {
        uint256 id;
        string name;
        string location;
        uint256 totalTokens;
        uint256 availableTokens;
        uint256 tokenPrice;
        bool active;
    }

    mapping(uint256 => Property) public properties;
    mapping(uint256 => mapping(address => uint256)) public ownership;

    event PropertyCreated(
        uint256 indexed propertyId,
        string name,
        string location,
        uint256 totalTokens,
        uint256 tokenPrice
    );

    event TokensPurchased(
        uint256 indexed propertyId,
        address indexed buyer,
        uint256 amount,
        uint256 totalCost
    );

    event TokensTransferred(
        uint256 indexed propertyId,
        address indexed from,
        address indexed to,
        uint256 amount
    );

    event PropertyStatusChanged(
        uint256 indexed propertyId,
        bool active
    );

    event FundsWithdrawn(
        address indexed owner,
        uint256 amount
    );

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner can perform this action");
        _;
    }

    modifier propertyExists(uint256 _propertyId) {
        require(_propertyId > 0 && _propertyId <= propertyCount, "Property does not exist");
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    /**
     * @dev Allows the owner/admin to add a new real estate property.
     * @param _name Name of the property.
     * @param _location Location of the property.
     * @param _totalTokens Total number of tokens representing the property.
     * @param _tokenPrice Price of each token in wei.
     */
    function addProperty(
        string calldata _name,
        string calldata _location,
        uint256 _totalTokens,
        uint256 _tokenPrice
    ) external onlyOwner {
        require(bytes(_name).length > 0, "Property name cannot be empty");
        require(bytes(_location).length > 0, "Property location cannot be empty");
        require(_totalTokens > 0, "Total tokens must be greater than zero");
        require(_tokenPrice > 0, "Token price must be greater than zero");

        propertyCount++;

        properties[propertyCount] = Property({
            id: propertyCount,
            name: _name,
            location: _location,
            totalTokens: _totalTokens,
            availableTokens: _totalTokens,
            tokenPrice: _tokenPrice,
            active: true
        });

        emit PropertyCreated(
            propertyCount,
            _name,
            _location,
            _totalTokens,
            _tokenPrice
        );
    }

    /**
     * @dev Allows investors to buy tokens of a selected property.
     * @param _propertyId ID of the property.
     * @param _amount Number of tokens to buy.
     */
    function buyTokens(
        uint256 _propertyId,
        uint256 _amount
    ) external payable propertyExists(_propertyId) {
        Property storage selectedProperty = properties[_propertyId];

        require(selectedProperty.active == true, "Property is not active");
        require(_amount > 0, "Token amount must be greater than zero");
        require(selectedProperty.availableTokens >= _amount, "Not enough tokens available");

        uint256 totalCost = _amount * selectedProperty.tokenPrice;
        require(msg.value == totalCost, "Incorrect ETH amount sent");

        selectedProperty.availableTokens -= _amount;
        ownership[_propertyId][msg.sender] += _amount;

        emit TokensPurchased(_propertyId, msg.sender, _amount, totalCost);
    }

    /**
     * @dev Allows token holders to transfer their property tokens to another wallet.
     * @param _propertyId ID of the property.
     * @param _to Receiver wallet address.
     * @param _amount Number of tokens to transfer.
     */
    function transferTokens(
        uint256 _propertyId,
        address _to,
        uint256 _amount
    ) external propertyExists(_propertyId) {
        require(_to != address(0), "Receiver address cannot be zero");
        require(_amount > 0, "Transfer amount must be greater than zero");
        require(ownership[_propertyId][msg.sender] >= _amount, "Insufficient token balance");

        ownership[_propertyId][msg.sender] -= _amount;
        ownership[_propertyId][_to] += _amount;

        emit TokensTransferred(_propertyId, msg.sender, _to, _amount);
    }

    /**
     * @dev Allows the owner to activate or deactivate a property listing.
     * @param _propertyId ID of the property.
     * @param _active New active status.
     */
    function setPropertyStatus(
        uint256 _propertyId,
        bool _active
    ) external onlyOwner propertyExists(_propertyId) {
        properties[_propertyId].active = _active;

        emit PropertyStatusChanged(_propertyId, _active);
    }

    /**
     * @dev Returns the number of tokens owned by a user for a specific property.
     * @param _propertyId ID of the property.
     * @param _user Wallet address of the user.
     */
    function getTokenBalance(
        uint256 _propertyId,
        address _user
    ) external view propertyExists(_propertyId) returns (uint256) {
        return ownership[_propertyId][_user];
    }

    /**
     * @dev Returns full details of a property.
     * @param _propertyId ID of the property.
     */
    function getProperty(
        uint256 _propertyId
    )
        external
        view
        propertyExists(_propertyId)
        returns (
            uint256 id,
            string memory name,
            string memory location,
            uint256 totalTokens,
            uint256 availableTokens,
            uint256 tokenPrice,
            bool active
        )
    {
        Property memory selectedProperty = properties[_propertyId];

        return (
            selectedProperty.id,
            selectedProperty.name,
            selectedProperty.location,
            selectedProperty.totalTokens,
            selectedProperty.availableTokens,
            selectedProperty.tokenPrice,
            selectedProperty.active
        );
    }

    /**
     * @dev Allows the owner to withdraw ETH collected from token purchases.
     */
    function withdrawFunds() external onlyOwner {
        uint256 balance = address(this).balance;
        require(balance > 0, "No funds available to withdraw");

        // SECURITY: Checks-Effects-Interactions pattern is applied.
        // Check is done above, no internal state needs updating, then ETH is transferred last.
        (bool success, ) = payable(owner).call{value: balance}("");
        require(success, "Withdrawal failed");

        emit FundsWithdrawn(owner, balance);
    }

    /**
     * @dev Returns contract ETH balance.
     */
    function getContractBalance() external view onlyOwner returns (uint256) {
        return address(this).balance;
    }
}